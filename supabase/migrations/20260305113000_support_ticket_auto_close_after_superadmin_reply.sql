-- Support ticket lifecycle update:
-- 1) superadmin reply keeps ticket in_progress (waiting org response)
-- 2) auto close ticket after 3 days without org follow-up

ALTER TABLE public.feedback_reports
DROP CONSTRAINT IF EXISTS feedback_reports_status_check;

ALTER TABLE public.feedback_reports
ADD CONSTRAINT feedback_reports_status_check
CHECK (
  status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])
);

CREATE OR REPLACE FUNCTION public.auto_close_stale_support_tickets(
  p_grace_interval interval DEFAULT interval '3 days',
  p_limit integer DEFAULT 2000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_count integer := 0;
  v_limit integer := GREATEST(COALESCE(p_limit, 2000), 1);
  v_grace interval := COALESCE(p_grace_interval, interval '3 days');
BEGIN
  WITH candidates AS (
    SELECT fr.id
    FROM public.feedback_reports fr
    WHERE fr.feedback_type = 'ticket'
      AND fr.reporter_role = 'admin_organisasi'
      AND fr.status = 'in_progress'
      AND COALESCE(NULLIF(BTRIM(fr.resolution_notes), ''), '') <> ''
      AND fr.updated_at <= now() - v_grace
    ORDER BY fr.updated_at ASC
    LIMIT v_limit
  )
  UPDATE public.feedback_reports fr
  SET
    status = 'closed',
    resolved_at = COALESCE(fr.resolved_at, now()),
    resolved_by = NULL,
    resolution_notes = concat_ws(
      E'\n\n',
      NULLIF(BTRIM(fr.resolution_notes), ''),
      '[Sistem] Tiket ditutup otomatis karena tidak ada balasan admin organisasi selama 3 hari.'
    ),
    updated_at = now()
  FROM candidates c
  WHERE fr.id = c.id;

  GET DIAGNOSTICS v_closed_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'closed_count', v_closed_count,
    'grace_interval', v_grace::text,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_close_stale_support_tickets(interval, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_support_tickets(interval, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_support_tickets(interval, integer) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-ticket-auto-close-hourly') THEN
      PERFORM cron.unschedule('support-ticket-auto-close-hourly');
    END IF;

    PERFORM cron.schedule(
      'support-ticket-auto-close-hourly',
      '15 * * * *',
      'SELECT public.auto_close_stale_support_tickets();'
    );
  END IF;
END;
$$;
