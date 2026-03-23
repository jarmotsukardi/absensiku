CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_ref text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  context text NOT NULL,
  message text NOT NULL,
  name text,
  stack text,
  route text,
  metadata jsonb,
  user_id uuid,
  tenant_id uuid,
  user_agent text,
  source text NOT NULL DEFAULT 'web'
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_occurred_at
  ON public.client_error_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_ref
  ON public.client_error_logs (error_ref);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_tenant_id
  ON public.client_error_logs (tenant_id);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client can insert own error logs" ON public.client_error_logs;
CREATE POLICY "Client can insert own error logs"
ON public.client_error_logs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (user_id IS NULL OR user_id = auth.uid())
);

DROP POLICY IF EXISTS "Super admin can read all client error logs" ON public.client_error_logs;
CREATE POLICY "Super admin can read all client error logs"
ON public.client_error_logs
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));
