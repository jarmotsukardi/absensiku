-- Guard overlap kontrak pegawai per tenant untuk status non-terminated.
-- Mencegah dua kontrak aktif/draft/ended bertumpuk pada rentang tanggal yang sama.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hr_contracts_no_overlapping_active_ranges'
  ) THEN
    ALTER TABLE public.hr_contracts
      ADD CONSTRAINT hr_contracts_no_overlapping_active_ranges
      EXCLUDE USING gist (
        tenant_id WITH =,
        employee_id WITH =,
        daterange(start_date, COALESCE(end_date, '9999-12-31'::date), '[]') WITH &&
      )
      WHERE (status <> 'terminated');
  END IF;
END;
$$;
