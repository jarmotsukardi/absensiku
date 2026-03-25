alter table public.subscription_packages
  add column if not exists attendance_base_price numeric(12, 2),
  add column if not exists hr_addon_price numeric(12, 2),
  add column if not exists payroll_addon_price numeric(12, 2);

update public.subscription_packages
set
  attendance_base_price = coalesce(attendance_base_price, base_price_per_month, 0),
  hr_addon_price = coalesce(hr_addon_price, 0),
  payroll_addon_price = coalesce(payroll_addon_price, 0);

alter table public.subscription_packages
  alter column attendance_base_price set default 0,
  alter column attendance_base_price set not null,
  alter column hr_addon_price set default 0,
  alter column hr_addon_price set not null,
  alter column payroll_addon_price set default 0,
  alter column payroll_addon_price set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_packages_price_components_non_negative_check'
  ) then
    alter table public.subscription_packages
      add constraint subscription_packages_price_components_non_negative_check
      check (
        attendance_base_price >= 0
        and hr_addon_price >= 0
        and payroll_addon_price >= 0
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_packages_price_components_scope_check'
  ) then
    alter table public.subscription_packages
      add constraint subscription_packages_price_components_scope_check
      check (
        (module_scope = 'attendance' and hr_addon_price = 0 and payroll_addon_price = 0)
        or (module_scope = 'attendance_hr' and payroll_addon_price = 0)
        or module_scope = 'attendance_hr_payroll'
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_packages_price_components_total_check'
  ) then
    alter table public.subscription_packages
      add constraint subscription_packages_price_components_total_check
      check (base_price_per_month = attendance_base_price + hr_addon_price + payroll_addon_price);
  end if;
end
$$;

update public.subscription_packages
set base_price_per_month = attendance_base_price + hr_addon_price + payroll_addon_price
where base_price_per_month <> attendance_base_price + hr_addon_price + payroll_addon_price;

update public.subscription_packages
set
  sort_order = sort_order * 10
where module_scope = 'attendance'
  and sort_order is not null
  and sort_order < 10;

insert into public.subscription_packages (
  name,
  duration_months,
  base_price_per_month,
  attendance_base_price,
  hr_addon_price,
  payroll_addon_price,
  discount_percentage,
  is_active,
  applies_to,
  description,
  features,
  module_scope,
  sort_order
)
select
  pkg.name,
  pkg.duration_months,
  pkg.attendance_base_price + round(pkg.attendance_base_price * 0.5),
  pkg.attendance_base_price,
  round(pkg.attendance_base_price * 0.5),
  0,
  pkg.discount_percentage,
  pkg.is_active,
  pkg.applies_to,
  coalesce(pkg.description, 'Paket bundle Absensi + HR'),
  pkg.features,
  'attendance_hr',
  case when pkg.sort_order is null then null else pkg.sort_order + 1 end
from public.subscription_packages pkg
where pkg.module_scope = 'attendance'
  and not exists (
    select 1
    from public.subscription_packages existing
    where existing.name = pkg.name
      and existing.duration_months = pkg.duration_months
      and existing.module_scope = 'attendance_hr'
  );

insert into public.subscription_packages (
  name,
  duration_months,
  base_price_per_month,
  attendance_base_price,
  hr_addon_price,
  payroll_addon_price,
  discount_percentage,
  is_active,
  applies_to,
  description,
  features,
  module_scope,
  sort_order
)
select
  pkg.name,
  pkg.duration_months,
  pkg.attendance_base_price + round(pkg.attendance_base_price * 0.5) + round(pkg.attendance_base_price * 0.8),
  pkg.attendance_base_price,
  round(pkg.attendance_base_price * 0.5),
  round(pkg.attendance_base_price * 0.8),
  pkg.discount_percentage,
  pkg.is_active,
  pkg.applies_to,
  coalesce(pkg.description, 'Paket bundle Absensi + HR + Payroll'),
  pkg.features,
  'attendance_hr_payroll',
  case when pkg.sort_order is null then null else pkg.sort_order + 2 end
from public.subscription_packages pkg
where pkg.module_scope = 'attendance'
  and not exists (
    select 1
    from public.subscription_packages existing
    where existing.name = pkg.name
      and existing.duration_months = pkg.duration_months
      and existing.module_scope = 'attendance_hr_payroll'
  );

comment on column public.subscription_packages.attendance_base_price is
  'Harga dasar modul Absensi per pegawai per bulan.';
comment on column public.subscription_packages.hr_addon_price is
  'Tambahan harga modul HR per pegawai per bulan.';
comment on column public.subscription_packages.payroll_addon_price is
  'Tambahan harga modul Payroll per pegawai per bulan.';
