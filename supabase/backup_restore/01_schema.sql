-- ================================================
-- ABSENSIKU COMPLETE DATABASE SCHEMA
-- Generated: 2026-02-14T12:34:22.689Z
-- ================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- ENUM TYPES
-- ================================================
CREATE TYPE app_role AS ENUM ('super_admin', 'admin_instansi', 'atasan', 'pegawai');
CREATE TYPE organization_type AS ENUM ('perusahaan', 'pemerintah_daerah', 'pemerintah_pusat', 'pendidikan', 'kesehatan', 'lainnya');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'expired', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('hadir', 'terlambat', 'tidak_hadir', 'izin', 'sakit', 'cuti', 'dinas_luar', 'wfh');
CREATE TYPE request_status AS ENUM ('menunggu', 'disetujui', 'ditolak');
CREATE TYPE leave_type AS ENUM ('cuti_tahunan', 'cuti_sakit', 'cuti_melahirkan', 'cuti_khusus', 'izin', 'dinas_luar', 'tanpa_keterangan');

-- ================================================
-- CORE TABLES
-- ================================================

-- Tenants (Organizations)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  organization_type organization_type DEFAULT 'perusahaan',
  email TEXT,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status subscription_status DEFAULT 'trial',
  max_employees INTEGER DEFAULT 2,
  max_offices INTEGER DEFAULT 1,
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  price_per_month NUMERIC,
  price_per_employee NUMERIC,
  auto_renew BOOLEAN DEFAULT false,
  payment_type VARCHAR DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- OPD
CREATE TABLE public.opd (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES opd(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Offices
CREATE TABLE public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES opd(id),
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  radius_meters INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Units
CREATE TABLE public.work_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES opd(id),
  name TEXT NOT NULL,
  code TEXT,
  institution_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Positions
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  work_unit_id UUID REFERENCES work_units(id),
  name TEXT NOT NULL,
  code TEXT,
  level INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opd_id UUID REFERENCES opd(id),
  office_id UUID REFERENCES offices(id),
  work_unit_id UUID REFERENCES work_units(id),
  position_id UUID REFERENCES positions(id),
  supervisor_id UUID REFERENCES employees(id),
  nik TEXT NOT NULL,
  nip TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  position TEXT,
  gelar_depan TEXT,
  gelar_belakang TEXT,
  address TEXT,
  gender TEXT,
  golongan TEXT,
  employee_category TEXT,
  android_id TEXT,
  last_login_device_id TEXT,
  device_id_reset_count INTEGER DEFAULT 0,
  device_id_last_reset TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  allow_flexible_attendance BOOLEAN DEFAULT false,
  flexible_attendance_limit INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Work Hours
CREATE TABLE public.work_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  time_in TIME NOT NULL,
  time_out TIME NOT NULL,
  institution_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Holidays
CREATE TABLE public.work_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  dates INTEGER[] NOT NULL,
  description TEXT,
  institution_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Work Shifts
CREATE TABLE public.work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  check_in_start TIME,
  check_in_end TIME,
  check_out_start TIME,
  check_out_end TIME,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Absence Limits
CREATE TABLE public.absence_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  warning_type TEXT NOT NULL,
  max_days INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Attendance Records (Partitioned)
CREATE TABLE public.attendance_records (
  id UUID DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  office_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time TIMESTAMPTZ,
  check_in_latitude NUMERIC,
  check_in_longitude NUMERIC,
  check_in_distance_meters NUMERIC,
  check_out_time TIMESTAMPTZ,
  check_out_latitude NUMERIC,
  check_out_longitude NUMERIC,
  check_out_distance_meters NUMERIC,
  status attendance_status DEFAULT 'tidak_hadir',
  is_corrected BOOLEAN DEFAULT false,
  is_wfh BOOLEAN DEFAULT false,
  is_flexible_attendance BOOLEAN DEFAULT false,
  shift_id UUID,
  original_shift_id UUID,
  shift_changed_at TIMESTAMPTZ,
  shift_change_reason TEXT,
  flexible_attendance_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, date)
) PARTITION BY RANGE (date);

-- Leave Requests
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  attachment_url TEXT,
  is_half_day BOOLEAN DEFAULT false,
  status request_status DEFAULT 'menunggu',
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Additional tables: system_settings, faqs, audit_logs, etc.
-- (Include all remaining table definitions...)

-- ================================================
-- ENABLE RLS ON ALL TABLES
-- ================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opd ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wfh_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wfh_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flexible_attendance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_type_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_job_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_change_logs ENABLE ROW LEVEL SECURITY;

-- ================================================
-- NOTES:
-- 1. Run this SQL first in the new Supabase project
-- 2. Then run RLS policies SQL
-- 3. Import data from JSON backup
-- 4. Create storage buckets
-- 5. Deploy edge functions
-- ================================================

