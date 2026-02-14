/**
 * Edge Function: batch-attendance
 * 
 * Strategy 2: Edge Function Queue Processor
 * Menerima batch attendance entries dan memproses sekaligus
 * menggunakan stored procedure process_attendance_batch.
 * 
 * Ini mengurangi jumlah koneksi database dari N menjadi 1
 * untuk setiap batch request.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createTraceId, logTraceError, withTrace } from '../_shared/error-utils.ts'

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
    if (entries.length > 10) {
      return new Response(
        JSON.stringify(withTrace({ success: false, message: 'Max 10 entries per batch' }, traceId)),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use service role for batch processing
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    const { data, error } = await adminClient.rpc('process_attendance_batch', {
      p_entries: JSON.stringify(entries),
    })

    if (error) {
      logTraceError(traceId, 'Batch processing error', error)
      return new Response(
        JSON.stringify(withTrace({ success: false, message: error.message }, traceId)),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, results: data }),
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
