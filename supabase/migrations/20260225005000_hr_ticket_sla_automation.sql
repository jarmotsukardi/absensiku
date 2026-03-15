-- Basic SLA automation for HR tickets:
-- - 24h overdue reminder
-- - 72h overdue escalation
-- Inserts deterministic status-audit rows (idempotent via source_audit_id).

CREATE OR REPLACE FUNCTION public.hr_ticket_run_sla_automation(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted_24 integer := 0;
  v_inserted_72 integer := 0;
BEGIN
  INSERT INTO public.hr_ticket_status_audits (
    ticket_id,
    tenant_id,
    source_audit_id,
    from_status,
    to_status,
    actor_name,
    note,
    created_at
  )
  SELECT
    fr.id,
    fr.tenant_id,
    'SLA-24H-OVERDUE',
    fr.status,
    fr.status,
    'System SLA',
    'SLA reminder: tiket melewati batas >=24 jam.',
    now()
  FROM public.feedback_reports fr
  CROSS JOIN LATERAL public.try_parse_jsonb(fr.browser_info) meta
  WHERE fr.feedback_type = 'ticket'
    AND fr.status IN ('open', 'in_progress')
    AND fr.tenant_id IS NOT NULL
    AND (p_tenant_id IS NULL OR fr.tenant_id = p_tenant_id)
    AND COALESCE(meta ->> 'due_date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
    AND now() >= ((meta ->> 'due_date')::date::timestamp + interval '1 day' + interval '24 hours')
    AND now() < ((meta ->> 'due_date')::date::timestamp + interval '1 day' + interval '72 hours')
    AND NOT EXISTS (
      SELECT 1
      FROM public.hr_ticket_status_audits aud
      WHERE aud.ticket_id = fr.id
        AND aud.source_audit_id = 'SLA-24H-OVERDUE'
    );
  GET DIAGNOSTICS v_inserted_24 = ROW_COUNT;

  INSERT INTO public.hr_ticket_status_audits (
    ticket_id,
    tenant_id,
    source_audit_id,
    from_status,
    to_status,
    actor_name,
    note,
    created_at
  )
  SELECT
    fr.id,
    fr.tenant_id,
    'SLA-72H-ESCALATION',
    fr.status,
    fr.status,
    'System SLA',
    'SLA escalation: tiket melewati batas >=72 jam, perlu eskalasi manajerial.',
    now()
  FROM public.feedback_reports fr
  CROSS JOIN LATERAL public.try_parse_jsonb(fr.browser_info) meta
  WHERE fr.feedback_type = 'ticket'
    AND fr.status IN ('open', 'in_progress')
    AND fr.tenant_id IS NOT NULL
    AND (p_tenant_id IS NULL OR fr.tenant_id = p_tenant_id)
    AND COALESCE(meta ->> 'due_date', '') ~ '^\\d{4}-\\d{2}-\\d{2}$'
    AND now() >= ((meta ->> 'due_date')::date::timestamp + interval '1 day' + interval '72 hours')
    AND NOT EXISTS (
      SELECT 1
      FROM public.hr_ticket_status_audits aud
      WHERE aud.ticket_id = fr.id
        AND aud.source_audit_id = 'SLA-72H-ESCALATION'
    );
  GET DIAGNOSTICS v_inserted_72 = ROW_COUNT;

  RETURN jsonb_build_object(
    'inserted_24h', v_inserted_24,
    'inserted_72h', v_inserted_72,
    'inserted_total', v_inserted_24 + v_inserted_72
  );
END;
$$;

REVOKE ALL ON FUNCTION public.hr_ticket_run_sla_automation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hr_ticket_run_sla_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ticket_run_sla_automation(uuid) TO service_role;
