import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createTraceId, logTraceError, withTrace } from '../_shared/error-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Edge function untuk maintenance partisi tabel absensi
 * 
 * Menjalankan:
 * 1. Cleanup GPS data > 7 hari (per partisi untuk menghindari locking)
 * 2. Auto-create partisi bulan berikutnya
 * 3. VACUUM ANALYZE setelah cleanup
 * 4. Cleanup audit log > 60 hari (hot retention)
 * 
 * Actions:
 * - cleanup_gps: Bersihkan data GPS lama
 * - create_partition: Buat partisi bulan depan
 * - analyze: Jalankan ANALYZE pada partisi
 * - cleanup_audit: Bersihkan audit log lama
 * - all: Jalankan semua maintenance
 * 
 * Disarankan dijalankan via cron:
 * - Cleanup GPS: Setiap hari jam 02:00 WIB
 * - ANALYZE: Setiap hari jam 03:00 WIB (1 jam setelah cleanup)
 * - Create partition: Setiap tanggal 25 tiap bulan
 * - Cleanup audit: Setiap minggu
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const traceId = createTraceId('partition-maintenance')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body untuk menentukan action
    let action = 'all'
    try {
      const body = await req.json()
      action = body.action || 'all'
    } catch {
      // Default to 'all' if no body
    }

    const results: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      action,
    }

    // Helper function untuk log critical error
    const logCriticalError = async (errorAction: string, tableName: string, errorMessage: string, details?: Record<string, unknown>) => {
      try {
        await supabase.rpc('log_critical_error', {
          p_action: errorAction,
          p_table_name: tableName,
          p_error_message: errorMessage,
          p_details: details || {}
        })
        logTraceError(traceId, `[CRITICAL] ${errorAction}: ${errorMessage}`, details)
      } catch (logError) {
        logTraceError(traceId, 'Failed to log critical error', logError)
      }
    }

    // 1. Cleanup GPS data per partisi
    if (action === 'all' || action === 'cleanup_gps') {
      console.log('Starting GPS cleanup per partition...')
      
      const { data: cleanupResult, error: cleanupError } = await supabase
        .rpc('cleanup_gps_data_partitioned')

      if (cleanupError) {
        logTraceError(traceId, 'GPS cleanup error', cleanupError)
        await logCriticalError('GPS_CLEANUP', 'attendance_records_partitioned', cleanupError.message, {
          step: 'cleanup_gps_data_partitioned',
          error_code: cleanupError.code
        })
        results.gps_cleanup = { success: false, error: cleanupError.message }
      } else {
        console.log('GPS cleanup completed:', cleanupResult)
        results.gps_cleanup = cleanupResult
      }
    }

    // 2. Create next month partition
    if (action === 'all' || action === 'create_partition') {
      console.log('Creating next month partition...')
      
      const { error: partitionError } = await supabase
        .rpc('create_next_month_partition')

      if (partitionError) {
        logTraceError(traceId, 'Partition creation error', partitionError)
        await logCriticalError('PARTITION_CREATE', 'attendance_records_partitioned', partitionError.message, {
          step: 'create_next_month_partition',
          error_code: partitionError.code
        })
        results.partition_creation = { success: false, error: partitionError.message }
      } else {
        results.partition_creation = { success: true, message: 'Next month partition ensured' }
      }
    }

    // 3. ANALYZE partisi setelah cleanup
    if (action === 'all' || action === 'analyze') {
      console.log('Running ANALYZE on partitions...')
      
      const { data: analyzeResult, error: analyzeError } = await supabase
        .rpc('analyze_attendance_partitions')

      if (analyzeError) {
        logTraceError(traceId, 'ANALYZE error', analyzeError)
        await logCriticalError('ANALYZE', 'attendance_records_partitioned', analyzeError.message, {
          step: 'analyze_attendance_partitions',
          error_code: analyzeError.code
        })
        results.analyze = { success: false, error: analyzeError.message }
      } else {
        console.log('ANALYZE completed:', analyzeResult)
        results.analyze = analyzeResult
      }
    }

    // 4. Cleanup old audit logs
    if (action === 'all' || action === 'cleanup_audit') {
      console.log('Cleaning up old audit logs...')
      
      const { data: auditCleanupResult, error: auditCleanupError } = await supabase
        .rpc('cleanup_old_audit_logs')

      if (auditCleanupError) {
        logTraceError(traceId, 'Audit cleanup error', auditCleanupError)
        await logCriticalError('AUDIT_CLEANUP', 'audit_logs', auditCleanupError.message, {
          step: 'cleanup_old_audit_logs',
          error_code: auditCleanupError.code
        })
        results.audit_cleanup = { success: false, error: auditCleanupError.message }
      } else {
        console.log('Audit cleanup completed:', auditCleanupResult)
        results.audit_cleanup = auditCleanupResult
      }
    }

    // 5. Optional: Cleanup old partitions (data > 2 tahun)
    if (action === 'cleanup_old_partitions') {
      console.log('Checking for old partitions to archive...')
      
      // Query untuk mendapatkan partisi yang lebih dari 2 tahun
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      const cutoffDate = twoYearsAgo.toISOString().slice(0, 7).replace('-', '_')
      
      results.old_partition_check = {
        cutoff_month: cutoffDate,
        message: 'Manual review required before dropping old partitions'
      }
    }

    // Log keseluruhan hasil jika ada error
    const hasErrors = Object.values(results).some(
      (r) => typeof r === 'object' && r !== null && 'success' in r && !(r as { success: boolean }).success
    )

    if (hasErrors) {
      console.warn(`[${traceId}] Maintenance completed with some errors:`, results)
    } else {
      console.log(`[${traceId}] Maintenance completed successfully:`, results)
    }

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        results,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error: unknown) {
    logTraceError(traceId, 'Partition maintenance critical error', error)
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    
    // Coba log critical error ke database
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      
      await supabase.rpc('log_critical_error', {
        p_action: 'MAINTENANCE_FATAL',
        p_table_name: 'partition-maintenance',
        p_error_message: errorMessage,
        p_details: { stack: error instanceof Error ? error.stack : undefined }
      })
    } catch {
      logTraceError(traceId, 'Failed to log fatal error to database')
    }
    
    return new Response(
      JSON.stringify(withTrace({
        success: false,
        error: errorMessage,
      }, traceId)),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
