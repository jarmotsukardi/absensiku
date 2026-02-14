-- Add organization_type enum and column to tenants table
CREATE TYPE public.organization_type AS ENUM ('pemerintah_daerah', 'instansi_pemerintah', 'perusahaan', 'sekolah');

ALTER TABLE public.tenants 
ADD COLUMN organization_type public.organization_type DEFAULT 'perusahaan';

-- Add description column for better organization info
ALTER TABLE public.tenants
ADD COLUMN description TEXT;