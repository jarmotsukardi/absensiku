-- ================================================================
-- FULL PARTITIONING UNTUK TABEL ATTENDANCE_RECORDS
-- Partisi bulanan berdasarkan kolom 'date'
-- ================================================================

-- 1. Buat tabel partitioned baru
CREATE TABLE public.attendance_records_partitioned (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL,
    office_id UUID NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    check_in_time TIMESTAMPTZ,
    check_in_latitude NUMERIC,
    check_in_longitude NUMERIC,
    check_in_distance_meters NUMERIC,
    check_out_time TIMESTAMPTZ,
    check_out_latitude NUMERIC,
    check_out_longitude NUMERIC,
    check_out_distance_meters NUMERIC,
    status attendance_status DEFAULT 'tidak_hadir',
    is_corrected BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    is_wfh BOOLEAN DEFAULT false,
    shift_id UUID,
    original_shift_id UUID,
    shift_changed_at TIMESTAMPTZ,
    shift_change_reason TEXT,
    notes TEXT,
    -- Primary key harus include partition key
    PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- 2. Buat index untuk performa query
CREATE INDEX idx_attendance_part_employee_date ON public.attendance_records_partitioned (employee_id, date);
CREATE INDEX idx_attendance_part_office_date ON public.attendance_records_partitioned (office_id, date);
CREATE INDEX idx_attendance_part_date ON public.attendance_records_partitioned (date);
CREATE INDEX idx_attendance_part_status ON public.attendance_records_partitioned (status);
CREATE INDEX idx_attendance_part_checkin_time ON public.attendance_records_partitioned (check_in_time);

-- 3. Buat partisi untuk bulan-bulan yang dibutuhkan (6 bulan ke belakang + 3 bulan ke depan)
-- Partisi 2025
CREATE TABLE public.attendance_records_p2025_07 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE public.attendance_records_p2025_08 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE public.attendance_records_p2025_09 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE public.attendance_records_p2025_10 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE public.attendance_records_p2025_11 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE public.attendance_records_p2025_12 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Partisi 2026
CREATE TABLE public.attendance_records_p2026_01 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE public.attendance_records_p2026_02 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE public.attendance_records_p2026_03 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE public.attendance_records_p2026_04 PARTITION OF public.attendance_records_partitioned
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- 4. Buat partisi default untuk data di luar range
CREATE TABLE public.attendance_records_default PARTITION OF public.attendance_records_partitioned DEFAULT;

-- 5. Enable RLS pada tabel partitioned
ALTER TABLE public.attendance_records_partitioned ENABLE ROW LEVEL SECURITY;

-- 6. Buat RLS policies yang sama dengan tabel original
CREATE POLICY "Admin can manage attendance_part" 
ON public.attendance_records_partitioned FOR ALL 
USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin_instansi'::app_role));

CREATE POLICY "Users can insert their own attendance_part" 
ON public.attendance_records_partitioned FOR INSERT 
WITH CHECK (employee_id = get_user_employee_id(auth.uid()));

CREATE POLICY "Users can update their own attendance_part" 
ON public.attendance_records_partitioned FOR UPDATE 
USING (employee_id = get_user_employee_id(auth.uid()))
WITH CHECK (employee_id = get_user_employee_id(auth.uid()));

CREATE POLICY "Users can view attendance_part in their tenant" 
ON public.attendance_records_partitioned FOR SELECT 
USING (
    employee_id = get_user_employee_id(auth.uid()) 
    OR is_super_admin(auth.uid()) 
    OR has_role(auth.uid(), 'admin_instansi'::app_role) 
    OR has_role(auth.uid(), 'atasan'::app_role)
);

-- 7. Fungsi untuk auto-create partisi bulan berikutnya
CREATE OR REPLACE FUNCTION public.create_next_month_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    next_month DATE;
    partition_name TEXT;
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
        
        -- Log pembuatan partisi
        INSERT INTO public.audit_logs (action, table_name, new_values)
        VALUES (
            'CREATE_PARTITION',
            'attendance_records_partitioned',
            jsonb_build_object(
                'partition_name', partition_name,
                'start_date', start_date,
                'end_date', end_date,
                'created_at', NOW()
            )
        );
        
        RAISE NOTICE 'Partisi % berhasil dibuat untuk periode % - %', partition_name, start_date, end_date;
    ELSE
        RAISE NOTICE 'Partisi % sudah ada', partition_name;
    END IF;
END;
$$;

-- 8. Fungsi untuk cleanup GPS data per partisi (data > 7 hari)
CREATE OR REPLACE FUNCTION public.cleanup_gps_data_partitioned()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    cutoff_date DATE;
    affected_rows INTEGER := 0;
    partition_record RECORD;
    partition_affected INTEGER;
    result JSONB := '[]'::jsonb;
BEGIN
    -- Hitung tanggal cutoff (7 hari lalu)
    cutoff_date := CURRENT_DATE - INTERVAL '7 days';
    
    -- Loop melalui setiap partisi dan update per partisi
    -- Ini mencegah locking pada seluruh tabel
    FOR partition_record IN
        SELECT 
            c.relname as partition_name,
            pg_get_expr(c.relpartbound, c.oid) as partition_bounds
        FROM pg_class c
        JOIN pg_inherits i ON c.oid = i.inhrelid
        JOIN pg_class p ON i.inhparent = p.oid
        WHERE p.relname = 'attendance_records_partitioned'
        AND c.relname != 'attendance_records_default'
        ORDER BY c.relname
    LOOP
        -- Update hanya pada partisi yang memiliki data yang perlu dibersihkan
        EXECUTE format(
            'UPDATE public.%I 
             SET check_in_latitude = NULL,
                 check_in_longitude = NULL,
                 check_out_latitude = NULL,
                 check_out_longitude = NULL
             WHERE date < $1
             AND (check_in_latitude IS NOT NULL OR check_out_latitude IS NOT NULL)',
            partition_record.partition_name
        ) USING cutoff_date;
        
        GET DIAGNOSTICS partition_affected = ROW_COUNT;
        
        IF partition_affected > 0 THEN
            affected_rows := affected_rows + partition_affected;
            result := result || jsonb_build_object(
                'partition', partition_record.partition_name,
                'cleaned_rows', partition_affected
            );
        END IF;
    END LOOP;
    
    -- Log cleanup
    IF affected_rows > 0 THEN
        INSERT INTO public.audit_logs (action, table_name, new_values)
        VALUES (
            'CLEANUP_GPS_DATA_PARTITIONED',
            'attendance_records_partitioned',
            jsonb_build_object(
                'cutoff_date', cutoff_date,
                'total_cleaned', affected_rows,
                'partitions', result,
                'executed_at', NOW()
            )
        );
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'cutoff_date', cutoff_date,
        'total_cleaned', affected_rows,
        'partitions_processed', result
    );
END;
$$;

-- 9. Migrasi data dari tabel lama ke partitioned (jika ada)
INSERT INTO public.attendance_records_partitioned (
    id, employee_id, office_id, date, check_in_time, check_in_latitude, check_in_longitude,
    check_in_distance_meters, check_out_time, check_out_latitude, check_out_longitude,
    check_out_distance_meters, status, is_corrected, created_at, updated_at, is_wfh,
    shift_id, original_shift_id, shift_changed_at, shift_change_reason, notes
)
SELECT 
    id, employee_id, office_id, date, check_in_time, check_in_latitude, check_in_longitude,
    check_in_distance_meters, check_out_time, check_out_latitude, check_out_longitude,
    check_out_distance_meters, status, is_corrected, created_at, updated_at, is_wfh,
    shift_id, original_shift_id, shift_changed_at, shift_change_reason, notes
FROM public.attendance_records
WHERE date >= '2025-07-01'
ON CONFLICT DO NOTHING;

-- 10. Buat view untuk backward compatibility
CREATE OR REPLACE VIEW public.v_attendance_records AS
SELECT * FROM public.attendance_records_partitioned;

-- 11. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records_partitioned TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records_partitioned TO service_role;

-- 12. Tambah komentar dokumentasi
COMMENT ON TABLE public.attendance_records_partitioned IS 'Tabel absensi dengan partisi bulanan untuk performa optimal. Gunakan tabel ini untuk data baru.';
COMMENT ON FUNCTION public.create_next_month_partition() IS 'Fungsi untuk otomatis membuat partisi bulan berikutnya. Jalankan via cron setiap bulan.';
COMMENT ON FUNCTION public.cleanup_gps_data_partitioned() IS 'Fungsi cleanup GPS data > 7 hari per partisi untuk menghindari locking.';