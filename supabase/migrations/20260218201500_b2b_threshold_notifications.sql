-- Otomasi notifikasi negosiasi B2B ketika tenant menembus ambang pegawai aktif.
-- Target penerima:
-- 1) Admin organisasi tenant terkait
-- 2) Super admin global
-- Notifikasi hanya untuk tenant dengan billing_mode = centralized.

CREATE OR REPLACE FUNCTION public.enqueue_b2b_negotiation_threshold_notification(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold INTEGER := 2000;
  v_active_employees INTEGER := 0;
  v_tenant_name TEXT;
  v_tenant_code TEXT;
  v_billing_mode TEXT;
  v_event_key TEXT;
  v_already_notified BOOLEAN := false;
  v_inserted_count INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT t.name, t.code, COALESCE(t.billing_mode, 'centralized')
  INTO v_tenant_name, v_tenant_code, v_billing_mode
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  LIMIT 1;

  IF v_tenant_name IS NULL THEN
    RETURN 0;
  END IF;

  IF v_billing_mode <> 'centralized' THEN
    RETURN 0;
  END IF;

  SELECT
    CASE
      WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::INTEGER
      WHEN jsonb_typeof(value->'value') = 'number' THEN (value->>'value')::INTEGER
      WHEN (value->>'value') ~ '^[0-9]+$' THEN (value->>'value')::INTEGER
      ELSE NULL
    END
  INTO v_threshold
  FROM public.system_settings
  WHERE key = 'b2b_negotiation_threshold'
  LIMIT 1;

  v_threshold := GREATEST(COALESCE(v_threshold, 2000), 1);

  SELECT COUNT(*)::INTEGER
  INTO v_active_employees
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    AND COALESCE(e.is_active, false) = true;

  IF v_active_employees < v_threshold THEN
    RETURN 0;
  END IF;

  v_event_key := format('b2b-threshold-crossed:%s:%s', p_tenant_id::TEXT, v_threshold::TEXT);

  PERFORM pg_advisory_xact_lock(hashtext(v_event_key));

  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.metadata->>'event_key' = v_event_key
  )
  INTO v_already_notified;

  IF v_already_notified THEN
    RETURN 0;
  END IF;

  WITH org_admin_recipients AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin_instansi'
      AND ur.tenant_id = p_tenant_id
      AND ur.user_id IS NOT NULL
  ),
  inserted_org_admin AS (
    INSERT INTO public.notifications (user_id, title, message, type, is_read, link, metadata)
    SELECT
      r.user_id,
      'Penawaran B2B tersedia',
      format(
        'Jumlah pegawai aktif organisasi Anda sudah %s pegawai (ambang negosiasi %s). Silakan lanjutkan pengajuan harga khusus B2B.',
        v_active_employees,
        v_threshold
      ),
      'warning',
      false,
      '/org/subscription',
      jsonb_build_object(
        'source', 'b2b_negotiation_threshold',
        'event_key', v_event_key,
        'tenant_id', p_tenant_id,
        'tenant_name', v_tenant_name,
        'tenant_code', v_tenant_code,
        'active_employees', v_active_employees,
        'threshold', v_threshold,
        'recipient_scope', 'tenant_admin',
        'billing_mode', v_billing_mode
      )
    FROM org_admin_recipients r
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER INTO v_inserted_count FROM inserted_org_admin;

  WITH org_admin_user_ids AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin_instansi'
      AND ur.tenant_id = p_tenant_id
      AND ur.user_id IS NOT NULL
  ),
  super_admin_recipients AS (
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'
      AND ur.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM org_admin_user_ids oa
        WHERE oa.user_id = ur.user_id
      )
  ),
  inserted_super_admin AS (
    INSERT INTO public.notifications (user_id, title, message, type, is_read, link, metadata)
    SELECT
      r.user_id,
      'Tenant menembus ambang negosiasi B2B',
      format(
        'Tenant %s (%s) mencapai %s pegawai aktif, melewati ambang %s. Tindak lanjutkan penawaran enterprise/B2B.',
        v_tenant_name,
        v_tenant_code,
        v_active_employees,
        v_threshold
      ),
      'warning',
      false,
      '/admin/subscriptions',
      jsonb_build_object(
        'source', 'b2b_negotiation_threshold',
        'event_key', v_event_key,
        'tenant_id', p_tenant_id,
        'tenant_name', v_tenant_name,
        'tenant_code', v_tenant_code,
        'active_employees', v_active_employees,
        'threshold', v_threshold,
        'recipient_scope', 'super_admin',
        'billing_mode', v_billing_mode
      )
    FROM super_admin_recipients r
    RETURNING id
  )
  SELECT v_inserted_count + COUNT(*)::INTEGER INTO v_inserted_count FROM inserted_super_admin;

  RETURN v_inserted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.scan_b2b_negotiation_threshold_notifications()
RETURNS TABLE (tenant_id uuid, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    public.enqueue_b2b_negotiation_threshold_notification(t.id)
  FROM public.tenants t
  WHERE COALESCE(t.billing_mode, 'centralized') = 'centralized';
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_b2b_negotiation_threshold_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL AND COALESCE(NEW.is_active, false) = true THEN
      PERFORM public.enqueue_b2b_negotiation_threshold_notification(NEW.tenant_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) =
       COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND COALESCE(OLD.is_active, false) = COALESCE(NEW.is_active, false) THEN
      RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NOT NULL AND COALESCE(NEW.is_active, false) = true THEN
      PERFORM public.enqueue_b2b_negotiation_threshold_notification(NEW.tenant_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_b2b_negotiation_threshold_notify ON public.employees;
CREATE TRIGGER trg_b2b_negotiation_threshold_notify
AFTER INSERT OR UPDATE OF tenant_id, is_active ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.trg_b2b_negotiation_threshold_notify();

-- Backfill awal agar tenant yang sudah menembus ambang juga menerima notifikasi.
SELECT public.scan_b2b_negotiation_threshold_notifications();
