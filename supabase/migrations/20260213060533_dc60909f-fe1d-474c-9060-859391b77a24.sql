
-- =============================================
-- FIX: Overly permissive RLS policies
-- These tables should only be modified by service_role (edge functions/triggers)
-- Service role bypasses RLS, so we make client-side policies restrictive
-- =============================================

-- 1. cron_job_logs: Only super_admin can SELECT, no client INSERT/UPDATE
DROP POLICY IF EXISTS "System can insert cron logs" ON public.cron_job_logs;
DROP POLICY IF EXISTS "System can update cron logs" ON public.cron_job_logs;

CREATE POLICY "No client insert on cron_job_logs"
  ON public.cron_job_logs FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client update on cron_job_logs"
  ON public.cron_job_logs FOR UPDATE
  TO authenticated
  USING (false);

-- 2. password_reset_otps: No client access at all
DROP POLICY IF EXISTS "Service role only - delete OTPs" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Service role only - insert OTPs" ON public.password_reset_otps;
DROP POLICY IF EXISTS "Service role only - update OTPs" ON public.password_reset_otps;

CREATE POLICY "No client access - insert OTPs"
  ON public.password_reset_otps FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "No client access - update OTPs"
  ON public.password_reset_otps FOR UPDATE
  TO authenticated, anon
  USING (false);

CREATE POLICY "No client access - delete OTPs"
  ON public.password_reset_otps FOR DELETE
  TO authenticated, anon
  USING (false);

CREATE POLICY "No client access - select OTPs"
  ON public.password_reset_otps FOR SELECT
  TO authenticated, anon
  USING (false);

-- 3. payment_logs: No client INSERT/UPDATE (service_role handles this)
DROP POLICY IF EXISTS "System can insert payment logs" ON public.payment_logs;
DROP POLICY IF EXISTS "System can update payment logs" ON public.payment_logs;

CREATE POLICY "No client insert on payment_logs"
  ON public.payment_logs FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client update on payment_logs"
  ON public.payment_logs FOR UPDATE
  TO authenticated
  USING (false);

-- 4. rate_limit_otp: No client access at all
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.rate_limit_otp;

CREATE POLICY "No client access - rate_limit_otp"
  ON public.rate_limit_otp FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 5. self_registered_users: Allow INSERT only for the registering user
DROP POLICY IF EXISTS "System can insert registrations" ON public.self_registered_users;

CREATE POLICY "Users can register themselves"
  ON public.self_registered_users FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 6. stability_streaks: No client INSERT/UPDATE (trigger handles this)
DROP POLICY IF EXISTS "System can update streaks" ON public.stability_streaks;
DROP POLICY IF EXISTS "System can upsert streaks" ON public.stability_streaks;

CREATE POLICY "No client insert on stability_streaks"
  ON public.stability_streaks FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client update on stability_streaks"
  ON public.stability_streaks FOR UPDATE
  TO authenticated
  USING (false);

-- 7. audit_logs: Block client INSERT/UPDATE/DELETE to prevent tampering
CREATE POLICY "No client insert on audit_logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No client update on audit_logs"
  ON public.audit_logs FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No client delete on audit_logs"
  ON public.audit_logs FOR DELETE
  TO authenticated
  USING (false);
