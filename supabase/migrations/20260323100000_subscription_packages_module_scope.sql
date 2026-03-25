alter table public.subscription_packages
  add column if not exists module_scope text;

update public.subscription_packages
set module_scope = 'attendance'
where module_scope is null or btrim(module_scope) = '';

alter table public.subscription_packages
  alter column module_scope set default 'attendance';

alter table public.subscription_packages
  alter column module_scope set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_packages_module_scope_check'
  ) then
    alter table public.subscription_packages
      add constraint subscription_packages_module_scope_check
      check (module_scope in ('attendance', 'attendance_hr', 'attendance_hr_payroll'));
  end if;
end
$$;

comment on column public.subscription_packages.module_scope is
  'Cakupan modul paket billing: attendance, attendance_hr, atau attendance_hr_payroll.';
