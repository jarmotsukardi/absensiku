-- Globalize positions at tenant level:
-- remove legacy OPD/work unit linkage so employees can pick position directly.
UPDATE public.positions
SET opd_id = NULL,
    work_unit_id = NULL
WHERE opd_id IS NOT NULL
   OR work_unit_id IS NOT NULL;
