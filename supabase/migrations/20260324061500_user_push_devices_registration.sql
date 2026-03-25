CREATE TABLE IF NOT EXISTS public.user_push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  installation_id TEXT NOT NULL CHECK (char_length(btrim(installation_id)) > 0),
  platform TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android')),
  device_id TEXT,
  device_model TEXT,
  app_version TEXT,
  app_code TEXT,
  fcm_token TEXT,
  notification_permission_state TEXT NOT NULL DEFAULT 'unknown'
    CHECK (notification_permission_state IN ('granted', 'denied', 'unknown')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_registered_at TIMESTAMPTZ,
  last_push_sent_at TIMESTAMPTZ,
  last_push_success_at TIMESTAMPTZ,
  last_push_error_at TIMESTAMPTZ,
  last_push_error_code TEXT,
  last_push_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_user_push_devices_user_active
  ON public.user_push_devices(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_push_devices_tenant_active
  ON public.user_push_devices(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_user_push_devices_installation
  ON public.user_push_devices(installation_id, platform);

CREATE INDEX IF NOT EXISTS idx_user_push_devices_fcm_token
  ON public.user_push_devices(fcm_token)
  WHERE fcm_token IS NOT NULL;

ALTER TABLE public.user_push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push devices" ON public.user_push_devices;
CREATE POLICY "Users can view own push devices"
ON public.user_push_devices
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own push devices" ON public.user_push_devices;
CREATE POLICY "Users can insert own push devices"
ON public.user_push_devices
FOR INSERT
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own push devices" ON public.user_push_devices;
CREATE POLICY "Users can update own push devices"
ON public.user_push_devices
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins can manage all push devices" ON public.user_push_devices;
CREATE POLICY "Super admins can manage all push devices"
ON public.user_push_devices
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_user_push_devices_updated_at ON public.user_push_devices;
CREATE TRIGGER trg_user_push_devices_updated_at
BEFORE UPDATE ON public.user_push_devices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
