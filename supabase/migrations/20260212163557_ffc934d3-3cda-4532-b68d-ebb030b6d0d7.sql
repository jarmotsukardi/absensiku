
-- 1. Fix payment_methods: restrict to authenticated users only
DROP POLICY IF EXISTS "Anyone can view payment methods" ON public.payment_methods;

CREATE POLICY "Authenticated users can view payment methods"
ON public.payment_methods
FOR SELECT
TO authenticated
USING (true);

-- 2. Fix materialized view exposure: revoke access from anon role
REVOKE SELECT ON public.mv_monthly_attendance_stats FROM anon;
