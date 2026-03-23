ALTER TABLE public.client_error_logs
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS archived_at timestamptz,
ADD COLUMN IF NOT EXISTS archived_by uuid,
ADD COLUMN IF NOT EXISTS archive_note text;

CREATE INDEX IF NOT EXISTS idx_client_error_logs_is_archived
  ON public.client_error_logs (is_archived);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_archived_at
  ON public.client_error_logs (archived_at DESC);

DROP POLICY IF EXISTS "Super admin can update client error logs" ON public.client_error_logs;
CREATE POLICY "Super admin can update client error logs"
ON public.client_error_logs
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
