-- Compatibility bootstrap so Supabase migrations can run on plain PostgreSQL dev container.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY,
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::UUID;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT '{}'::JSONB;
$$;

CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public BOOLEAN DEFAULT false,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id BIGSERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner UUID,
  owner_id TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_bucket_id ON storage.objects(bucket_id);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS cron;

CREATE TABLE IF NOT EXISTS cron.job (
  jobid BIGSERIAL PRIMARY KEY,
  schedule TEXT NOT NULL,
  command TEXT NOT NULL,
  nodename TEXT DEFAULT '',
  nodeport INTEGER DEFAULT 5432,
  database TEXT DEFAULT current_database(),
  username TEXT DEFAULT current_user,
  active BOOLEAN DEFAULT true,
  jobname TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS cron.job_run_details (
  runid BIGSERIAL PRIMARY KEY,
  jobid BIGINT,
  job_pid INTEGER,
  database TEXT,
  username TEXT,
  command TEXT,
  status TEXT DEFAULT 'succeeded',
  return_message TEXT,
  start_time TIMESTAMPTZ DEFAULT now(),
  end_time TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION cron.schedule(p_jobname TEXT, p_schedule TEXT, p_command TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_jobid BIGINT;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command, database, username, active)
  VALUES (p_jobname, p_schedule, p_command, current_database(), current_user, true)
  ON CONFLICT (jobname)
  DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command, active = true
  RETURNING jobid INTO v_jobid;
  RETURN v_jobid;
END;
$$;

CREATE OR REPLACE FUNCTION cron.schedule(p_schedule TEXT, p_command TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_jobid BIGINT;
BEGIN
  INSERT INTO cron.job (schedule, command, database, username, active)
  VALUES (p_schedule, p_command, current_database(), current_user, true)
  RETURNING jobid INTO v_jobid;
  RETURN v_jobid;
END;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_jobname TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM cron.job WHERE jobname = p_jobname;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM cron.job WHERE jobid = p_jobid;
  RETURN true;
END;
$$;

CREATE SCHEMA IF NOT EXISTS net;

CREATE OR REPLACE FUNCTION net.http_post(url TEXT, headers JSONB DEFAULT '{}'::JSONB, body JSONB DEFAULT '{}'::JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 1;
END;
$$;

-- Fallback function needed by legacy manual-payment migrations.
CREATE OR REPLACE FUNCTION public.guard_manual_payment_verified_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;
