-- Drop existing policy for attendance_records
DROP POLICY IF EXISTS "Users can view attendance in their tenant" ON public.attendance_records;

-- Create new policy dengan supervisor hierarchy check
CREATE POLICY "Users can view attendance based on hierarchy"
ON public.attendance_records
FOR SELECT
USING (
  -- User dapat melihat absensi mereka sendiri
  (employee_id = get_user_employee_id(auth.uid()))
  
  -- Super admin dapat melihat semua
  OR is_super_admin(auth.uid())
  
  -- Admin instansi dapat melihat semua di tenant mereka
  OR (
    has_role(auth.uid(), 'admin_instansi'::app_role)
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = attendance_records.employee_id
        AND e.tenant_id = get_user_tenant_id(auth.uid())
    )
  )
  
  -- Atasan hanya dapat melihat bawahan langsung mereka
  OR (
    has_role(auth.uid(), 'atasan'::app_role)
    AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = attendance_records.employee_id
        AND e.supervisor_id = get_user_employee_id(auth.uid())
    )
  )
);