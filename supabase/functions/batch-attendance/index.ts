/**
 * Edge Function: batch-attendance
 * 
 * Queue-first ingestion:
 * 1) Enqueue semua event absensi
 * 2) Proses queue terurut untuk batch ini
 *
 * Ini memastikan idempotency dan memberi fallback retry via queue worker.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createTraceId, logTraceError, withTrace } from '../_shared/error-utils.ts'
import { decideBatchIngestPolicy } from '../_shared/attendance-scalability.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const traceId = createTraceId('batch-attendance')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify(withTrace({ success: false, message: 'Unauthorized' }, traceId)),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify user token
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify(withTrace({ success: false, message: 'Invalid token' }, traceId)),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { entries } = body as { entries: Array<{
      buffer_id: string;
      idempotency_key?: string;
      type: 'check_in' | 'check_out';
      employee_id: string;
      office_id: string;
      latitude: number;
      longitude: number;
      distance_meters: number;
      date: string;
    }> }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return new Response(
        JSON.stringify(withTrace({ success: false, message: 'No entries provided' }, traceId)),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Limit batch size to prevent abuse
    if (entries.length > 100) {
      return new Response(
        JSON.stringify(withTrace({ success: false, message: 'Max 100 entries per batch' }, traceId)),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role for batch processing
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data: scalabilityRow, error: scalabilityError } = await adminClient
      .from('system_settings')
      .select('value')
      .eq('key', 'attendance_scalability')
      .maybeSingle()

    if (scalabilityError) {
      logTraceError(traceId, 'Failed to load attendance_scalability, using safe fallback', scalabilityError)
    }

    const ingestPolicy = decideBatchIngestPolicy(scalabilityRow?.value)

    const { data: enqueued, error: enqueueError } = await adminClient.rpc('enqueue_attendance_batch', {
      p_entries: entries,
      p_trace_id: traceId,
    })

    if (enqueueError) {
      logTraceError(traceId, 'Batch enqueue error', enqueueError)
      return new Response(
        JSON.stringify(withTrace({ success: false, message: enqueueError.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const enqueueResults = Array.isArray(enqueued) ? enqueued : []
    const queueIds = enqueueResults
      .map((item) => item?.queue_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)

    let processedResults = enqueueResults
    let processingSkipped = false
    if (queueIds.length > 0 && ingestPolicy.shouldProcessQueueNow) {
      const { data: processed, error: processError } = await adminClient.rpc('process_attendance_queue', {
        p_limit: Math.min(queueIds.length, 100),
        p_trace_id: traceId,
        p_queue_ids: queueIds,
      })

      if (processError) {
        logTraceError(traceId, 'Queue processing error (kept queued for retry)', processError)
      } else if (Array.isArray(processed) && processed.length > 0) {
        const merged = new Map<string, Record<string, unknown>>()

        for (const item of enqueueResults) {
          const key = typeof item?.buffer_id === 'string' && item.buffer_id.length > 0
            ? item.buffer_id
            : `${item?.queue_id ?? Math.random()}`
          merged.set(key, item as Record<string, unknown>)
        }

        for (const item of processed) {
          const key = typeof item?.buffer_id === 'string' && item.buffer_id.length > 0
            ? item.buffer_id
            : `${item?.queue_id ?? Math.random()}`
          merged.set(key, item as Record<string, unknown>)
        }

        processedResults = Array.from(merged.values())
      }
    } else if (queueIds.length > 0) {
      processingSkipped = true
    }

    const health = processingSkipped
      ? null
      : await (async () => {
          const { data: healthData, error: healthError } = await adminClient.rpc('get_attendance_ingest_health')
          if (healthError) {
            logTraceError(traceId, 'Failed to fetch attendance ingest health', healthError)
            return null
          }
          return Array.isArray(healthData) ? healthData[0] : null
        })()

    return new Response(
      JSON.stringify({
        success: true,
        trace_id: traceId,
        enqueued_count: enqueueResults.length,
        processed_count: processedResults.filter((item) => item?.queue_status === 'processed').length,
        processing_skipped: processingSkipped,
        processing_policy_reason: ingestPolicy.reason,
        peak_hour_active: ingestPolicy.peakHourActive,
        queue_only_ingest_active: ingestPolicy.queueOnlyIngest,
        offpeak_release_strategy: ingestPolicy.offpeakReleaseStrategy,
        results: processedResults,
        health,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    logTraceError(traceId, 'Unexpected error', error)
    return new Response(
      JSON.stringify(withTrace({ success: false, message: 'Internal server error' }, traceId)),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
