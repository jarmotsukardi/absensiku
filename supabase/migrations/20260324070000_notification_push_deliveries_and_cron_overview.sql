create table if not exists public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_push_device_id uuid not null references public.user_push_devices(id) on delete cascade,
  user_id uuid not null,
  tenant_id uuid null references public.tenants(id) on delete set null,
  platform text not null default 'android',
  delivery_status text not null default 'SENT',
  provider text null,
  provider_message_id text null,
  trace_id text null,
  error_code text null,
  error_message text null,
  payload jsonb null default '{}'::jsonb,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_push_deliveries_status_check
    check (delivery_status in ('SENT', 'FAILED', 'SKIPPED')),
  constraint notification_push_deliveries_unique unique (notification_id, user_push_device_id)
);

create index if not exists idx_notification_push_deliveries_notification
  on public.notification_push_deliveries(notification_id);

create index if not exists idx_notification_push_deliveries_user
  on public.notification_push_deliveries(user_id, created_at desc);

create index if not exists idx_notification_push_deliveries_tenant
  on public.notification_push_deliveries(tenant_id, created_at desc);

create index if not exists idx_notification_push_deliveries_status
  on public.notification_push_deliveries(delivery_status, created_at desc);

alter table public.notification_push_deliveries enable row level security;

drop policy if exists "Users can view own notification push deliveries" on public.notification_push_deliveries;
create policy "Users can view own notification push deliveries"
on public.notification_push_deliveries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Super admins can view all notification push deliveries" on public.notification_push_deliveries;
create policy "Super admins can view all notification push deliveries"
on public.notification_push_deliveries
for all
to authenticated
using (public.is_super_admin(auth.uid()))
with check (public.is_super_admin(auth.uid()));

drop trigger if exists trg_notification_push_deliveries_updated_at on public.notification_push_deliveries;
create trigger trg_notification_push_deliveries_updated_at
before update on public.notification_push_deliveries
for each row
execute function public.update_updated_at_column();

create or replace function public.get_cron_jobs_overview()
returns table(
  job_name text,
  category text,
  target text,
  description text,
  timezone text,
  expected_schedule text,
  current_schedule text,
  is_scheduled boolean,
  is_active boolean,
  command_preview text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_auth_role text := auth.role();
  v_has_cron boolean := false;
begin
  if coalesce(v_auth_role, '') <> 'service_role' and (v_uid is null or not is_super_admin(v_uid)) then
    raise exception 'forbidden';
  end if;

  select exists (select 1 from pg_namespace where nspname = 'cron') into v_has_cron;

  if not v_has_cron then
    return query
    with policy as (
      select
        case
          when lower(coalesce(ss.value->>'audit_cleanup_enabled', '')) in ('true', 'false')
            then (ss.value->>'audit_cleanup_enabled')::boolean
          else true
        end as audit_cleanup_enabled,
        case
          when lower(coalesce(ss.value->>'error_cleanup_enabled', '')) in ('true', 'false')
            then (ss.value->>'error_cleanup_enabled')::boolean
          else true
        end as error_cleanup_enabled,
        coalesce(nullif(trim(ss.value->>'audit_cleanup_cron'), ''), '10 20 * * *') as audit_cleanup_cron,
        coalesce(nullif(trim(ss.value->>'error_cleanup_cron'), ''), '0 18 * * *') as error_cleanup_cron
      from (
        select coalesce(
          (
            select value
            from public.system_settings
            where key = 'log_cleanup_cron_policy'
            limit 1
          ),
          '{}'::jsonb
        ) as value
      ) ss
    ),
    catalog as (
      select *
      from (values
        ('attendance-ingest-worker', 'Attendance', 'SQL/RPC', 'Memproses queue absensi offline->DB.', 'UTC (WIB +7)', '* * * * *'),
        ('org-dashboard-snapshot-5m', 'Dashboard', 'SQL/RPC', 'Refresh snapshot dashboard organisasi (skip otomatis saat jam sibuk absensi).', 'UTC (WIB +7)', '*/5 * * * *'),
        ('cleanup-gps-daily', 'Maintenance', 'SQL/RPC', 'Membersihkan GPS lama pada tabel absensi partisi.', 'UTC (WIB +7)', '0 19 * * *'),
        ('analyze-partitions-daily', 'Maintenance', 'SQL/RPC', 'VACUUM ANALYZE partisi absensi harian.', 'UTC (WIB +7)', '0 20 * * *'),
        ('create-next-month-partition-monthly', 'Maintenance', 'SQL/RPC', 'Membuat partisi bulan berikutnya.', 'UTC (WIB +7)', '0 18 24 * *'),
        ('streak-subscription-sync-daily', 'Billing', 'SQL/RPC', 'Sinkron status subscription terhadap grace period streak.', 'UTC (WIB +7)', '10 17 * * *'),
        ('invoice-number-health-daily', 'Billing', 'SQL/RPC', 'Snapshot harian kesehatan nomor faktur (valid vs invalid format).', 'UTC (WIB +7)', '15 17 * * *'),
        ('billing-grace-notifier-10m', 'Billing', 'Edge Function', 'Kirim invoice grace period ke email/WhatsApp.', 'UTC (WIB +7)', '*/10 * * * *'),
        ('device-push-dispatcher-5m', 'Notifikasi', 'Edge Function', 'Kirim notifikasi push APK Android dari tabel notifications ke perangkat aktif.', 'UTC (WIB +7)', '*/5 * * * *')
      ) as t(job_name, category, target, description, timezone, expected_schedule)
      union all
      select
        'cleanup-audit-logs-daily-dynamic',
        'Maintenance',
        'SQL/RPC',
        'Pembersihan log audit harian mengikuti retensi aktif.',
        'UTC (WIB +7)',
        p.audit_cleanup_cron
      from policy p
      union all
      select
        'client-error-logs-retention-daily',
        'Maintenance',
        'SQL/RPC',
        'Pembersihan log error client harian sesuai retensi.',
        'UTC (WIB +7)',
        p.error_cleanup_cron
      from policy p
    )
    select
      c.job_name,
      c.category,
      c.target,
      c.description,
      c.timezone,
      c.expected_schedule,
      null::text as current_schedule,
      false as is_scheduled,
      false as is_active,
      null::text as command_preview
    from catalog c
    order by c.category, c.job_name;

    return;
  end if;

  return query
  with policy as (
    select
      case
        when lower(coalesce(ss.value->>'audit_cleanup_enabled', '')) in ('true', 'false')
          then (ss.value->>'audit_cleanup_enabled')::boolean
        else true
      end as audit_cleanup_enabled,
      case
        when lower(coalesce(ss.value->>'error_cleanup_enabled', '')) in ('true', 'false')
          then (ss.value->>'error_cleanup_enabled')::boolean
        else true
      end as error_cleanup_enabled,
      coalesce(nullif(trim(ss.value->>'audit_cleanup_cron'), ''), '10 20 * * *') as audit_cleanup_cron,
      coalesce(nullif(trim(ss.value->>'error_cleanup_cron'), ''), '0 18 * * *') as error_cleanup_cron
    from (
      select coalesce(
        (
          select value
          from public.system_settings
          where key = 'log_cleanup_cron_policy'
          limit 1
        ),
        '{}'::jsonb
      ) as value
    ) ss
  ),
  catalog as (
    select *
    from (values
      ('attendance-ingest-worker', 'Attendance', 'SQL/RPC', 'Memproses queue absensi offline->DB.', 'UTC (WIB +7)', '* * * * *'),
      ('org-dashboard-snapshot-5m', 'Dashboard', 'SQL/RPC', 'Refresh snapshot dashboard organisasi (skip otomatis saat jam sibuk absensi).', 'UTC (WIB +7)', '*/5 * * * *'),
      ('cleanup-gps-daily', 'Maintenance', 'SQL/RPC', 'Membersihkan GPS lama pada tabel absensi partisi.', 'UTC (WIB +7)', '0 19 * * *'),
      ('analyze-partitions-daily', 'Maintenance', 'SQL/RPC', 'VACUUM ANALYZE partisi absensi harian.', 'UTC (WIB +7)', '0 20 * * *'),
      ('create-next-month-partition-monthly', 'Maintenance', 'SQL/RPC', 'Membuat partisi bulan berikutnya.', 'UTC (WIB +7)', '0 18 24 * *'),
      ('streak-subscription-sync-daily', 'Billing', 'SQL/RPC', 'Sinkron status subscription terhadap grace period streak.', 'UTC (WIB +7)', '10 17 * * *'),
      ('invoice-number-health-daily', 'Billing', 'SQL/RPC', 'Snapshot harian kesehatan nomor faktur (valid vs invalid format).', 'UTC (WIB +7)', '15 17 * * *'),
      ('billing-grace-notifier-10m', 'Billing', 'Edge Function', 'Kirim invoice grace period ke email/WhatsApp.', 'UTC (WIB +7)', '*/10 * * * *'),
      ('device-push-dispatcher-5m', 'Notifikasi', 'Edge Function', 'Kirim notifikasi push APK Android dari tabel notifications ke perangkat aktif.', 'UTC (WIB +7)', '*/5 * * * *')
    ) as t(job_name, category, target, description, timezone, expected_schedule)
    union all
    select
      'cleanup-audit-logs-daily-dynamic',
      'Maintenance',
      'SQL/RPC',
      'Pembersihan log audit harian mengikuti retensi aktif.',
      'UTC (WIB +7)',
      p.audit_cleanup_cron
    from policy p
    union all
    select
      'client-error-logs-retention-daily',
      'Maintenance',
      'SQL/RPC',
      'Pembersihan log error client harian sesuai retensi.',
      'UTC (WIB +7)',
      p.error_cleanup_cron
    from policy p
  )
  select
    c.job_name,
    c.category,
    c.target,
    c.description,
    c.timezone,
    c.expected_schedule,
    j.schedule as current_schedule,
    (j.jobid is not null) as is_scheduled,
    coalesce(j.active, false) as is_active,
    case
      when j.jobid is null then null
      when c.job_name in ('billing-grace-notifier-10m', 'device-push-dispatcher-5m') then '[masked http command]'
      else left(j.command, 160)
    end as command_preview
  from catalog c
  left join cron.job j on j.jobname = c.job_name
  order by c.category, c.job_name;
end;
$function$;

grant execute on function public.get_cron_jobs_overview() to authenticated, service_role;
