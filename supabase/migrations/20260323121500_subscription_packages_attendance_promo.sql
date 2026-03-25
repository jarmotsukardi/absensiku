alter table public.subscription_packages
  add column if not exists promo_active boolean,
  add column if not exists promo_price_per_month numeric(12, 2),
  add column if not exists promo_label text;

update public.subscription_packages
set
  promo_active = coalesce(promo_active, false),
  promo_price_per_month = case
    when promo_price_per_month is not null and promo_price_per_month < 0 then 0
    else promo_price_per_month
  end,
  promo_label = nullif(trim(coalesce(promo_label, '')), '')
where true;

alter table public.subscription_packages
  alter column promo_active set default false,
  alter column promo_active set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_packages_promo_non_negative_check'
  ) then
    alter table public.subscription_packages
      add constraint subscription_packages_promo_non_negative_check
      check (promo_price_per_month is null or promo_price_per_month >= 0);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_packages_promo_consistency_check'
  ) then
    alter table public.subscription_packages
      add constraint subscription_packages_promo_consistency_check
      check (
        promo_active = false
        or (
          promo_price_per_month is not null
          and promo_price_per_month <= base_price_per_month
        )
      );
  end if;
end
$$;

update public.subscription_packages
set
  promo_active = true,
  promo_price_per_month = 5000,
  promo_label = 'Promo Absensi 1-3 Bulan'
where module_scope = 'attendance'
  and duration_months in (1, 3);

comment on column public.subscription_packages.promo_active is
  'Menandakan paket sedang memakai harga promo efektif.';
comment on column public.subscription_packages.promo_price_per_month is
  'Harga promo efektif per pegawai per bulan yang menggantikan harga normal saat promo aktif.';
comment on column public.subscription_packages.promo_label is
  'Label promo ringkas untuk admin billing dan pricing publik.';
