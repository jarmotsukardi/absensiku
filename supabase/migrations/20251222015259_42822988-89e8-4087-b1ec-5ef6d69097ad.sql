-- Add new columns to employees table
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS gelar_depan TEXT,
ADD COLUMN IF NOT EXISTS gelar_belakang TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('laki-laki', 'perempuan')),
ADD COLUMN IF NOT EXISTS golongan TEXT,
ADD COLUMN IF NOT EXISTS employee_category TEXT CHECK (employee_category IN ('ASN', 'P3K')),
ADD COLUMN IF NOT EXISTS work_unit_id UUID REFERENCES public.work_units(id),
ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id);

-- Create index for work_unit_id and position_id
CREATE INDEX IF NOT EXISTS idx_employees_work_unit_id ON public.employees(work_unit_id);
CREATE INDEX IF NOT EXISTS idx_employees_position_id ON public.employees(position_id);