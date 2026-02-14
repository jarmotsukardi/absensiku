-- Fix: Enable RLS pada semua partisi tabel
ALTER TABLE public.attendance_records_p2025_07 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2025_08 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2025_09 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2025_10 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2025_11 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2025_12 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2026_01 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2026_02 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2026_03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_p2026_04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records_default ENABLE ROW LEVEL SECURITY;

-- Drop view yang menyebabkan SECURITY DEFINER warning
DROP VIEW IF EXISTS public.v_attendance_records;

-- Buat view dengan SECURITY INVOKER (default) - lebih aman
CREATE VIEW public.v_attendance_records 
WITH (security_invoker = on)
AS SELECT * FROM public.attendance_records_partitioned;