-- Migration: HR Leave Approval Workflow Bridge
-- Tanggal: 2026-03-13
-- Deskripsi: Menyambungkan leave_requests dengan konfigurasi hr_approval_types

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS approval_type_code TEXT NOT NULL DEFAULT 'LEAVE',
  ADD COLUMN IF NOT EXISTS current_approval_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS required_approval_levels INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approval_history JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.leave_requests lr
SET approval_type_code = COALESCE(NULLIF(lt.approval_type_code, ''), lr.approval_type_code, 'LEAVE')
FROM public.leave_types lt
WHERE lr.leave_type_id = lt.id
  AND COALESCE(NULLIF(lt.approval_type_code, ''), 'LEAVE') IS DISTINCT FROM lr.approval_type_code;

WITH workflow_levels AS (
  SELECT
    hat.tenant_id,
    hat.type_code,
    GREATEST(COALESCE(jsonb_array_length(hat.levels), 0), 1) AS level_count
  FROM public.hr_approval_types hat
  WHERE hat.is_active = TRUE
),
request_workflow_levels AS (
  SELECT
    lr.id AS leave_request_id,
    COALESCE(wl.level_count, 1) AS level_count
  FROM public.leave_requests lr
  JOIN public.employees e ON e.id = lr.employee_id
  LEFT JOIN workflow_levels wl
    ON wl.tenant_id = e.tenant_id
   AND wl.type_code = lr.approval_type_code
)
UPDATE public.leave_requests lr
SET required_approval_levels = request_workflow_levels.level_count
FROM request_workflow_levels
WHERE request_workflow_levels.leave_request_id = lr.id
  AND request_workflow_levels.level_count IS DISTINCT FROM lr.required_approval_levels;

UPDATE public.leave_requests
SET current_approval_level = GREATEST(
  1,
  CASE
    WHEN status = 'disetujui' THEN required_approval_levels
    ELSE current_approval_level
  END
);

CREATE INDEX IF NOT EXISTS leave_requests_approval_type_code_idx
  ON public.leave_requests(approval_type_code);

CREATE INDEX IF NOT EXISTS leave_requests_approval_progress_idx
  ON public.leave_requests(status, current_approval_level, required_approval_levels);
