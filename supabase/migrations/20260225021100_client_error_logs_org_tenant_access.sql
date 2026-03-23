-- Allow org HR/admin-operator roles to read and update tenant-scoped client error logs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_error_logs'
      AND policyname = 'Org tenant can read client error logs'
  ) THEN
    CREATE POLICY "Org tenant can read client error logs"
      ON public.client_error_logs
      FOR SELECT
      USING (
        is_super_admin(auth.uid())
        OR (
          tenant_id = get_user_tenant_id(auth.uid())
          AND (
            has_role(auth.uid(), 'admin_instansi'::app_role)
            OR has_role(auth.uid(), 'atasan'::app_role)
          )
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_error_logs'
      AND policyname = 'Org tenant can update client error logs'
  ) THEN
    CREATE POLICY "Org tenant can update client error logs"
      ON public.client_error_logs
      FOR UPDATE
      USING (
        is_super_admin(auth.uid())
        OR (
          tenant_id = get_user_tenant_id(auth.uid())
          AND (
            has_role(auth.uid(), 'admin_instansi'::app_role)
            OR has_role(auth.uid(), 'atasan'::app_role)
          )
        )
      )
      WITH CHECK (
        is_super_admin(auth.uid())
        OR (
          tenant_id = get_user_tenant_id(auth.uid())
          AND (
            has_role(auth.uid(), 'admin_instansi'::app_role)
            OR has_role(auth.uid(), 'atasan'::app_role)
          )
        )
      );
  END IF;
END $$;
