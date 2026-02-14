-- Enable pg_cron dan pg_net untuk scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Buat fungsi untuk mendapatkan statistik partisi
CREATE OR REPLACE FUNCTION public.get_partition_stats()
RETURNS TABLE (
    partition_name TEXT,
    row_count BIGINT,
    total_size TEXT,
    index_size TEXT,
    table_size TEXT,
    date_range TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.relname::TEXT as partition_name,
        pg_catalog.pg_stat_get_live_tuples(c.oid) as row_count,
        pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
        pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
        pg_size_pretty(pg_table_size(c.oid)) as table_size,
        pg_get_expr(c.relpartbound, c.oid)::TEXT as date_range
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_class p ON i.inhparent = p.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.relname = 'attendance_records_partitioned'
    AND n.nspname = 'public'
    ORDER BY c.relname;
END;
$$;

-- Buat fungsi untuk mendapatkan log cleanup GPS
CREATE OR REPLACE FUNCTION public.get_gps_cleanup_logs(limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
    id UUID,
    executed_at TIMESTAMPTZ,
    cutoff_date DATE,
    total_cleaned INTEGER,
    partitions_processed JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.created_at as executed_at,
        (al.new_values->>'cutoff_date')::DATE as cutoff_date,
        (al.new_values->>'total_cleaned')::INTEGER as total_cleaned,
        al.new_values->'partitions' as partitions_processed
    FROM public.audit_logs al
    WHERE al.action = 'CLEANUP_GPS_DATA_PARTITIONED'
    ORDER BY al.created_at DESC
    LIMIT limit_count;
END;
$$;

-- Buat fungsi untuk mendapatkan log pembuatan partisi
CREATE OR REPLACE FUNCTION public.get_partition_creation_logs(limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
    id UUID,
    created_at TIMESTAMPTZ,
    partition_name TEXT,
    start_date DATE,
    end_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.created_at,
        (al.new_values->>'partition_name')::TEXT as partition_name,
        (al.new_values->>'start_date')::DATE as start_date,
        (al.new_values->>'end_date')::DATE as end_date
    FROM public.audit_logs al
    WHERE al.action = 'CREATE_PARTITION'
    ORDER BY al.created_at DESC
    LIMIT limit_count;
END;
$$;

-- Buat tabel untuk menyimpan status cron job
CREATE TABLE IF NOT EXISTS public.cron_job_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    result JSONB,
    error_message TEXT
);

-- Enable RLS
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;

-- Policy: hanya super admin yang bisa melihat
CREATE POLICY "Super admin can view cron logs"
ON public.cron_job_logs FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "System can insert cron logs"
ON public.cron_job_logs FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update cron logs"
ON public.cron_job_logs FOR UPDATE
USING (true);

-- Grant ke service_role untuk insert dari edge function
GRANT INSERT, UPDATE ON public.cron_job_logs TO service_role;
GRANT SELECT ON public.cron_job_logs TO authenticated;