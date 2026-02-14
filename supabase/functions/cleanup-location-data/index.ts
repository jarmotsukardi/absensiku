import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createTraceId, logTraceError, withTrace } from '../_shared/error-utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Edge function untuk cleanup data GPS pada tabel attendance_records_partitioned
 * 
 * CATATAN: Fungsi ini adalah versi legacy yang menggunakan pendekatan sederhana.
 * Untuk skala besar, gunakan partition-maintenance dengan action 'cleanup_gps'
 * yang melakukan cleanup per-partisi untuk menghindari locking.
 * 
 * Fungsi ini tetap dipertahankan untuk backward compatibility.
 */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const traceId = createTraceId('cleanup-location-data')

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Calculate date 30 days ago (legacy behavior)
    // Untuk cleanup 7 hari, gunakan partition-maintenance
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0]

    console.log(`Starting cleanup for records older than ${cutoffDate}`)

    // Update old attendance records to remove GPS coordinates
    // Menggunakan tabel partitioned yang baru
    const { data, error } = await supabase
      .from('attendance_records_partitioned')
      .update({
        check_in_latitude: null,
        check_in_longitude: null,
        check_out_latitude: null,
        check_out_longitude: null,
        // Keep distance for reporting but remove exact coordinates
      })
      .lt('date', cutoffDate)
      .not('check_in_latitude', 'is', null)
      .select('id')

    if (error) {
      logTraceError(traceId, 'Error cleaning up location data', error)
      throw error
    }

    const cleanedCount = data?.length || 0
    console.log(`Successfully cleaned ${cleanedCount} records`)

    // Log the cleanup action
    await supabase.from('audit_logs').insert({
      action: 'CLEANUP_LOCATION_DATA_LEGACY',
      table_name: 'attendance_records_partitioned',
      new_values: {
        cutoff_date: cutoffDate,
        records_cleaned: cleanedCount,
        timestamp: new Date().toISOString(),
        note: 'Legacy cleanup function - consider using partition-maintenance for better performance'
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned location data from ${cleanedCount} records older than ${cutoffDate}`,
        records_cleaned: cleanedCount,
        recommendation: 'For better performance, use partition-maintenance edge function with action: cleanup_gps'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    logTraceError(traceId, 'Cleanup error', error)
    
    return new Response(
      JSON.stringify(withTrace({
        success: false,
        error: 'Internal server error',
      }, traceId)),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
