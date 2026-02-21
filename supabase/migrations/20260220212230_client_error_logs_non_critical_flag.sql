-- Persist non-critical classification for noisy/transient client errors.
-- This allows admin log triage to separate critical vs non-critical consistently,
-- including historical rows.

ALTER TABLE public.client_error_logs
ADD COLUMN IF NOT EXISTS is_non_critical boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_client_error_logs_is_non_critical
  ON public.client_error_logs (is_non_critical);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_non_critical_archived
  ON public.client_error_logs (is_non_critical, is_archived, occurred_at DESC);

UPDATE public.client_error_logs
SET is_non_critical = true
WHERE
  lower(coalesce(context, '')) LIKE '%fetch.network_error%'
  OR lower(coalesce(context, '')) LIKE '%hard_request_notifications.fetch_employee_ids%'
  OR lower(coalesce(context, '')) LIKE '%hard_request_notifications.fetch_count%'
  OR lower(coalesce(context, '')) LIKE '%hard_request_notifications.fetch_latest%'
  OR lower(coalesce(context, '')) LIKE '%hard_request_notifications.realtime%'
  OR lower(coalesce(context, '')) LIKE '%persistent_notifications.realtime_channel%'
  OR lower(coalesce(message, '')) LIKE '%networkerror when attempting to fetch resource%'
  OR lower(coalesce(message, '')) LIKE '%failed to fetch%'
  OR lower(coalesce(message, '')) LIKE '%network request failed%'
  OR lower(coalesce(message, '')) LIKE '%sebagian sumber notifikasi%';
