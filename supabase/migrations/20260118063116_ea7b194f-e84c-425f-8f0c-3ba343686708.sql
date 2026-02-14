-- =====================================================
-- PENYEMPURNAAN SISTEM PARTITIONING - FINAL
-- =====================================================

-- 1. VERIFIKASI DEFAULT PARTITION (sudah ada, tapi pastikan)
-- Default partition attendance_records_default sudah dibuat sebelumnya

-- 2. COMPOSITE INDEX untuk setiap partisi (employee_id + date)
-- Index ini mempercepat query laporan per organisasi

-- Index untuk partisi default
CREATE INDEX IF NOT EXISTS idx_attendance_default_emp_date 
ON public.attendance_records_default (employee_id, date);

-- Index untuk partisi 2025
CREATE INDEX IF NOT EXISTS idx_attendance_p2025_07_emp_date 
ON public.attendance_records_p2025_07 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2025_08_emp_date 
ON public.attendance_records_p2025_08 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2025_09_emp_date 
ON public.attendance_records_p2025_09 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2025_10_emp_date 
ON public.attendance_records_p2025_10 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2025_11_emp_date 
ON public.attendance_records_p2025_11 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2025_12_emp_date 
ON public.attendance_records_p2025_12 (employee_id, date);

-- Index untuk partisi 2026
CREATE INDEX IF NOT EXISTS idx_attendance_p2026_01_emp_date 
ON public.attendance_records_p2026_01 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2026_02_emp_date 
ON public.attendance_records_p2026_02 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2026_03_emp_date 
ON public.attendance_records_p2026_03 (employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_p2026_04_emp_date 
ON public.attendance_records_p2026_04 (employee_id, date);

-- 3. FUNGSI CLEANUP AUDIT LOG (hapus data > 45 hari)
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    cutoff_date TIMESTAMPTZ;
    deleted_count INTEGER;
BEGIN
    -- Hitung tanggal cutoff (45 hari lalu)
    cutoff_date := NOW() - INTERVAL '45 days';
    
    -- Hapus audit log lama
    DELETE FROM public.audit_logs
    WHERE created_at < cutoff_date
    AND action NOT IN ('CREATE_PARTITION', 'CLEANUP_GPS_DATA_PARTITIONED'); -- Jangan hapus log maintenance
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup (jangan log jika tidak ada yang dihapus)
    IF deleted_count > 0 THEN
        INSERT INTO public.audit_logs (action, table_name, new_values)
        VALUES (
            'CLEANUP_AUDIT_LOGS',
            'audit_logs',
            jsonb_build_object(
                'cutoff_date', cutoff_date,
                'deleted_count', deleted_count,
                'executed_at', NOW()
            )
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'cutoff_date', cutoff_date,
        'deleted_count', deleted_count
    );
END;
$$;

-- 4. FUNGSI VACUUM ANALYZE untuk partisi
CREATE OR REPLACE FUNCTION public.analyze_attendance_partitions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    partition_record RECORD;
    analyzed_partitions TEXT[] := '{}';
BEGIN
    -- Loop melalui setiap partisi dan analyze
    FOR partition_record IN
        SELECT c.relname as partition_name
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        JOIN pg_class p ON i.inhparent = p.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE p.relname = 'attendance_records_partitioned'
        AND n.nspname = 'public'
        ORDER BY c.relname
    LOOP
        -- ANALYZE setiap partisi
        EXECUTE format('ANALYZE public.%I', partition_record.partition_name);
        analyzed_partitions := array_append(analyzed_partitions, partition_record.partition_name);
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'analyzed_partitions', analyzed_partitions,
        'executed_at', NOW()
    );
END;
$$;

-- 5. LOG CRITICAL ERROR FUNCTION
CREATE OR REPLACE FUNCTION public.log_critical_error(
    p_action TEXT,
    p_table_name TEXT,
    p_error_message TEXT,
    p_details JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    INSERT INTO public.audit_logs (action, table_name, new_values)
    VALUES (
        'CRITICAL_' || p_action,
        p_table_name,
        jsonb_build_object(
            'level', 'CRITICAL',
            'error', p_error_message,
            'details', COALESCE(p_details, '{}'::jsonb),
            'logged_at', NOW()
        )
    );
END;
$$;

-- 6. UPDATE create_next_month_partition untuk auto-create composite index
CREATE OR REPLACE FUNCTION public.create_next_month_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    next_month DATE;
    partition_name TEXT;
    index_name TEXT;
    start_date DATE;
    end_date DATE;
    partition_exists BOOLEAN;
BEGIN
    -- Hitung bulan berikutnya
    next_month := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    start_date := next_month;
    end_date := next_month + INTERVAL '1 month';
    
    -- Format nama partisi: attendance_records_pYYYY_MM
    partition_name := 'attendance_records_p' || TO_CHAR(next_month, 'YYYY_MM');
    index_name := 'idx_attendance_p' || TO_CHAR(next_month, 'YYYY_MM') || '_emp_date';
    
    -- Cek apakah partisi sudah ada
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = partition_name
    ) INTO partition_exists;
    
    -- Buat partisi jika belum ada
    IF NOT partition_exists THEN
        EXECUTE format(
            'CREATE TABLE public.%I PARTITION OF public.attendance_records_partitioned 
             FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            start_date,
            end_date
        );
        
        -- Buat composite index untuk partisi baru
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON public.%I (employee_id, date)',
            index_name,
            partition_name
        );
        
        -- Log pembuatan partisi
        INSERT INTO public.audit_logs (action, table_name, new_values)
        VALUES (
            'CREATE_PARTITION',
            'attendance_records_partitioned',
            jsonb_build_object(
                'partition_name', partition_name,
                'start_date', start_date,
                'end_date', end_date,
                'index_created', index_name,
                'created_at', NOW()
            )
        );
        
        RAISE NOTICE 'Partisi % berhasil dibuat dengan index %', partition_name, index_name;
    ELSE
        RAISE NOTICE 'Partisi % sudah ada', partition_name;
    END IF;
END;
$$;

-- 7. CRON JOB untuk cleanup audit log (setiap minggu, Minggu jam 03:00 WIB = 20:00 UTC Sabtu)
SELECT cron.schedule(
    'cleanup-audit-logs-weekly',
    '0 20 * * 6', -- Setiap Sabtu 20:00 UTC = Minggu 03:00 WIB
    $$
    SELECT public.cleanup_old_audit_logs();
    $$
);

-- 8. CRON JOB untuk ANALYZE setelah cleanup GPS (jam 03:00 WIB = 20:00 UTC, 1 jam setelah cleanup)
SELECT cron.schedule(
    'analyze-partitions-daily',
    '0 20 * * *', -- Setiap hari 20:00 UTC = 03:00 WIB (1 jam setelah cleanup GPS)
    $$
    SELECT public.analyze_attendance_partitions();
    $$
);