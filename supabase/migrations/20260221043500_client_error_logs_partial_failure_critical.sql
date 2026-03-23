-- Keep partial hard-request notification failures in critical queue.
-- These indicate degraded functionality and should remain visible in Kritis tab.

UPDATE public.client_error_logs
SET is_non_critical = false
WHERE lower(coalesce(context, '')) LIKE '%hard_request_notifications.partial_failure%';
