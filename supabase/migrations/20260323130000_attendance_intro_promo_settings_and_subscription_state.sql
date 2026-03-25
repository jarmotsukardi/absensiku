insert into public.billing_settings (setting_key, setting_value, description)
values (
  'attendance_intro_promo',
  jsonb_build_object(
    'active', true,
    'promo_price_per_month', 5000,
    'promo_duration_months', 2,
    'new_tenants_only', true,
    'label', 'Promo onboarding 2 bulan pertama'
  ),
  'Promo onboarding attendance yang berlaku untuk 1/2/3 bulan pertama per subscription.'
)
on conflict (setting_key) do nothing;

alter table public.subscriptions
  add column if not exists intro_promo_active boolean not null default false,
  add column if not exists intro_promo_price_per_employee numeric,
  add column if not exists intro_promo_duration_months integer,
  add column if not exists intro_promo_months_consumed integer not null default 0,
  add column if not exists intro_promo_label text,
  add column if not exists intro_promo_started_at date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_intro_promo_non_negative_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_intro_promo_non_negative_check
      check (
        coalesce(intro_promo_price_per_employee, 0) >= 0
        and coalesce(intro_promo_duration_months, 0) >= 0
        and coalesce(intro_promo_months_consumed, 0) >= 0
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_intro_promo_duration_cap_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_intro_promo_duration_cap_check
      check (
        intro_promo_duration_months is null
        or intro_promo_duration_months between 1 and 3
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_intro_promo_consumed_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_intro_promo_consumed_check
      check (
        intro_promo_duration_months is null
        or intro_promo_months_consumed <= intro_promo_duration_months
      );
  end if;
end $$;

comment on column public.subscriptions.intro_promo_active is
  'Menandai apakah subscription masih memiliki masa promo onboarding yang belum habis.';

comment on column public.subscriptions.intro_promo_price_per_employee is
  'Harga promo onboarding per pegawai per bulan untuk subscription attendance.';

comment on column public.subscriptions.intro_promo_duration_months is
  'Total durasi promo onboarding dalam bulan untuk subscription attendance.';

comment on column public.subscriptions.intro_promo_months_consumed is
  'Jumlah bulan promo onboarding yang sudah terpakai oleh invoice PAID.';

comment on column public.subscriptions.intro_promo_label is
  'Label promo onboarding yang disalin dari setting saat promo pertama kali diterapkan.';

comment on column public.subscriptions.intro_promo_started_at is
  'Tanggal mulai promo onboarding pada subscription.';

update public.subscription_packages
set
  promo_active = false,
  promo_price_per_month = null,
  promo_label = null,
  updated_at = now()
where coalesce(module_scope, 'attendance') = 'attendance'
  and coalesce(promo_active, false) = true;
