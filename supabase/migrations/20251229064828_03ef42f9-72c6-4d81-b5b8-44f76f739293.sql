-- Add policy to allow employees to update their own attendance records (for checkout)
CREATE POLICY "Users can update their own attendance" 
ON public.attendance_records 
FOR UPDATE 
USING (employee_id = get_user_employee_id(auth.uid()))
WITH CHECK (employee_id = get_user_employee_id(auth.uid()));