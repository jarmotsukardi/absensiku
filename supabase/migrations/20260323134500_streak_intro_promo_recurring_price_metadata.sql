create or replace function public.create_pending_streak_invoice(p_tenant_id uuid, p_grace_days integer default 7)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_tenant_id uuid;
  v_existing_invoice_id uuid;
  v_employee_count integer := 1;
  v_price_per_employee numeric := 15000;
  v_subscription_price_per_employee numeric := null;
  v_subscription_recurring_price_per_employee numeric := null;
  v_subscription_last_invoice_id uuid := null;
  v_subscription_intro_promo_active boolean := false;
  v_subscription_intro_promo_price numeric := null;
  v_subscription_intro_promo_duration integer := 0;
  v_subscription_intro_promo_consumed integer := 0;
  v_subscription_intro_promo_label text := null;
  v_intro_promo_remaining_months integer := 0;
  v_intro_promo_months_applied integer := 0;
  v_intro_promo_consumed_after_invoice integer := 0;
  v_ppn_percentage numeric := 11;
  v_pph_percentage numeric := 2;
  v_tax_percentage numeric := 13;
  v_subtotal numeric;
  v_ppn_amount numeric;
  v_pph_amount numeric;
  v_vat_amount numeric;
  v_gross_amount numeric;
  v_invoice_number text;
  v_due_date date;
  v_invoice_id uuid;
  v_invoice_notes text;
  v_package_id uuid := null;
  v_package_scope text := 'attendance';
  v_package_scope_label text := 'Absensi';
  v_package_name text := 'Streak Billing';
  v_invoice_metadata jsonb := jsonb_build_object('streak_billing', true);
  v_last_invoice_scope text := 'attendance';
  v_resolved_package_base_price numeric := null;
  v_b2b_threshold integer := 2000;
  v_pricing_reason text := 'package_base';
begin
  if v_actor_id is not null then
    if not is_super_admin(v_actor_id) then
      v_actor_tenant_id := get_user_tenant_id(v_actor_id);
      if v_actor_tenant_id is null or v_actor_tenant_id <> p_tenant_id then
        raise exception 'forbidden';
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('streak_invoice:' || p_tenant_id::text));

  select id
  into v_existing_invoice_id
  from public.invoices
  where tenant_id = p_tenant_id
    and status in ('PENDING', 'AWAITING_VERIFICATION')
  order by created_at desc
  limit 1;

  if v_existing_invoice_id is not null then
    return v_existing_invoice_id;
  end if;

  select count(*)::integer
  into v_employee_count
  from public.employees
  where tenant_id = p_tenant_id
    and is_active = true;

  v_employee_count := greatest(coalesce(v_employee_count, 0), 1);

  select
    s.last_invoice_id,
    s.price_per_employee,
    coalesce(s.intro_promo_active, false),
    s.intro_promo_price_per_employee,
    coalesce(s.intro_promo_duration_months, 0),
    coalesce(s.intro_promo_months_consumed, 0),
    s.intro_promo_label
  into
    v_subscription_last_invoice_id,
    v_subscription_price_per_employee,
    v_subscription_intro_promo_active,
    v_subscription_intro_promo_price,
    v_subscription_intro_promo_duration,
    v_subscription_intro_promo_consumed,
    v_subscription_intro_promo_label
  from public.subscriptions s
  where s.tenant_id = p_tenant_id
  order by s.updated_at desc nulls last, s.created_at desc nulls last
  limit 1;

  if v_subscription_last_invoice_id is not null then
    select coalesce(pkg.module_scope, 'attendance')
    into v_last_invoice_scope
    from public.invoices inv
    left join public.subscription_packages pkg
      on pkg.id = inv.package_id
    where inv.id = v_subscription_last_invoice_id
    limit 1;
  end if;

  select
    pkg.id,
    coalesce(pkg.module_scope, 'attendance'),
    pkg.base_price_per_month
  into
    v_package_id,
    v_package_scope,
    v_resolved_package_base_price
  from public.subscription_packages pkg
  where coalesce(pkg.is_active, true) = true
    and pkg.duration_months = 1
    and coalesce(pkg.module_scope, 'attendance') = coalesce(v_last_invoice_scope, 'attendance')
  order by pkg.sort_order asc nulls last, pkg.created_at asc, pkg.id asc
  limit 1;

  if v_package_id is null and coalesce(v_last_invoice_scope, 'attendance') <> 'attendance' then
    select
      pkg.id,
      coalesce(pkg.module_scope, 'attendance'),
      pkg.base_price_per_month
    into
      v_package_id,
      v_package_scope,
      v_resolved_package_base_price
    from public.subscription_packages pkg
    where coalesce(pkg.is_active, true) = true
      and pkg.duration_months = 1
      and coalesce(pkg.module_scope, 'attendance') = 'attendance'
    order by pkg.sort_order asc nulls last, pkg.created_at asc, pkg.id asc
    limit 1;
  end if;

  select coalesce(
    case
      when jsonb_typeof(value) = 'number' then trim(both '"' from value::text)::integer
      when jsonb_typeof(value->'value') = 'number' then (value->>'value')::integer
      when (value->>'value') ~ '^[0-9]+$' then (value->>'value')::integer
      else null
    end,
    2000
  )
  into v_b2b_threshold
  from public.system_settings
  where key = 'b2b_negotiation_threshold'
  limit 1;

  v_package_scope := coalesce(v_package_scope, coalesce(v_last_invoice_scope, 'attendance'), 'attendance');
  v_intro_promo_remaining_months := greatest(
    coalesce(v_subscription_intro_promo_duration, 0) - coalesce(v_subscription_intro_promo_consumed, 0),
    0
  );

  if v_package_scope = 'attendance'
     and v_subscription_price_per_employee is not null
     and v_subscription_price_per_employee > 0
     and v_employee_count >= greatest(coalesce(v_b2b_threshold, 2000), 2000) then
    v_price_per_employee := v_subscription_price_per_employee;
    v_pricing_reason := 'negotiated_b2b';
  elsif v_package_scope = 'attendance'
        and coalesce(v_subscription_intro_promo_active, false)
        and v_subscription_intro_promo_price is not null
        and v_subscription_intro_promo_price > 0
        and v_intro_promo_remaining_months > 0 then
    v_price_per_employee := v_subscription_intro_promo_price;
    v_pricing_reason := 'attendance_intro_promo';
  elsif v_resolved_package_base_price is not null
        and v_resolved_package_base_price > 0 then
    v_price_per_employee := v_resolved_package_base_price;
    v_pricing_reason := 'package_base';
  elsif v_subscription_price_per_employee is not null
        and v_subscription_price_per_employee > 0 then
    v_price_per_employee := v_subscription_price_per_employee;
    v_pricing_reason := 'subscription_snapshot';
  else
    select coalesce(
      case
        when jsonb_typeof(setting_value->'amount') = 'number' then (setting_value->>'amount')::numeric
        when (setting_value->>'amount') ~ '^[0-9]+(\.[0-9]+)?$' then (setting_value->>'amount')::numeric
        when jsonb_typeof(setting_value->'value') = 'number' then (setting_value->>'value')::numeric
        when (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' then (setting_value->>'value')::numeric
        else null
      end,
      15000
    )
    into v_price_per_employee
    from public.billing_settings
    where setting_key = 'price_per_employee'
    limit 1;
    v_pricing_reason := 'billing_global';
  end if;

  v_package_scope_label := case v_package_scope
    when 'attendance_hr' then 'Absensi + HR'
    when 'attendance_hr_payroll' then 'Absensi + HR + Payroll'
    else 'Absensi'
  end;

  if v_package_id is not null then
    v_package_name := 'Streak Billing • ' || v_package_scope_label;
  end if;

  v_intro_promo_months_applied := case when v_pricing_reason = 'attendance_intro_promo' then 1 else 0 end;
  v_intro_promo_consumed_after_invoice := least(
    greatest(coalesce(v_subscription_intro_promo_duration, 0), 0),
    greatest(coalesce(v_subscription_intro_promo_consumed, 0), 0) + v_intro_promo_months_applied
  );
  v_subscription_recurring_price_per_employee := case
    when v_pricing_reason = 'attendance_intro_promo'
      then coalesce(nullif(v_resolved_package_base_price, 0), nullif(v_subscription_price_per_employee, 0), v_price_per_employee)
    else coalesce(nullif(v_price_per_employee, 0), nullif(v_resolved_package_base_price, 0), nullif(v_subscription_price_per_employee, 0), 0)
  end;

  v_invoice_metadata := jsonb_build_object(
    'streak_billing', true,
    'package_scope', v_package_scope,
    'package_display_name', v_package_name,
    'pricing_reason', v_pricing_reason,
    'package_base_price_per_employee', v_resolved_package_base_price,
    'subscription_recurring_price_per_employee', nullif(v_subscription_recurring_price_per_employee, 0),
    'attendance_intro_promo_active', coalesce(v_pricing_reason = 'attendance_intro_promo', false),
    'attendance_intro_promo_price_per_employee', v_subscription_intro_promo_price,
    'attendance_intro_promo_duration_months', v_subscription_intro_promo_duration,
    'attendance_intro_promo_months_applied', v_intro_promo_months_applied,
    'attendance_intro_promo_months_consumed_before_invoice', v_subscription_intro_promo_consumed,
    'attendance_intro_promo_months_consumed_after_invoice', v_intro_promo_consumed_after_invoice,
    'attendance_intro_promo_months_remaining_after_invoice', case
      when v_pricing_reason = 'attendance_intro_promo'
        then greatest(v_intro_promo_remaining_months - v_intro_promo_months_applied, 0)
      else greatest(v_intro_promo_remaining_months, 0)
    end,
    'attendance_intro_promo_label', v_subscription_intro_promo_label
  );

  select coalesce(
    case
      when jsonb_typeof(setting_value->'value') = 'number' then (setting_value->>'value')::numeric
      when (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' then (setting_value->>'value')::numeric
      else null
    end,
    11
  )
  into v_ppn_percentage
  from public.billing_settings
  where setting_key = 'vat_percentage'
  limit 1;

  select coalesce(
    case
      when jsonb_typeof(setting_value->'value') = 'number' then (setting_value->>'value')::numeric
      when (setting_value->>'value') ~ '^[0-9]+(\.[0-9]+)?$' then (setting_value->>'value')::numeric
      else null
    end,
    2
  )
  into v_pph_percentage
  from public.billing_settings
  where setting_key = 'pph_percentage'
  limit 1;

  v_tax_percentage := v_ppn_percentage + v_pph_percentage;
  v_subtotal := v_employee_count * v_price_per_employee;
  v_ppn_amount := round(v_subtotal * (v_ppn_percentage / 100), 0);
  v_pph_amount := round(v_subtotal * (v_pph_percentage / 100), 0);
  v_vat_amount := v_ppn_amount + v_pph_amount;
  v_gross_amount := v_subtotal + v_vat_amount;
  v_due_date := current_date + greatest(coalesce(p_grace_days, 7), 0);

  select public.generate_invoice_number() into v_invoice_number;
  if coalesce(v_invoice_number, '') = '' then
    v_invoice_number := 'INV-' || to_char(now(), 'YYYYMM') || '-AUTO' || to_char(now(), 'DDHH24MISS');
  end if;

  v_invoice_notes := case v_pricing_reason
    when 'negotiated_b2b' then 'Tagihan otomatis: target streak tercapai (harga negosiasi B2B)'
    when 'attendance_intro_promo' then 'Tagihan otomatis: target streak tercapai (promo onboarding aktif)'
    else 'Tagihan otomatis: target streak tercapai'
  end;

  insert into public.invoices (
    tenant_id,
    invoice_number,
    package_id,
    package_name,
    package_duration_months,
    employee_count,
    price_per_employee,
    subtotal,
    discount_amount,
    vat_percentage,
    vat_amount,
    ppn_percentage,
    pph_percentage,
    ppn_amount,
    pph_amount,
    gross_amount,
    xendit_fee,
    net_amount,
    status,
    payment_method_type,
    issue_date,
    due_date,
    notes,
    metadata
  )
  values (
    p_tenant_id,
    v_invoice_number,
    v_package_id,
    v_package_name,
    1,
    v_employee_count,
    v_price_per_employee,
    v_subtotal,
    0,
    v_tax_percentage,
    v_vat_amount,
    v_ppn_percentage,
    v_pph_percentage,
    v_ppn_amount,
    v_pph_amount,
    v_gross_amount,
    0,
    v_gross_amount,
    'PENDING',
    'MANUAL_TRANSFER',
    current_date,
    v_due_date,
    v_invoice_notes,
    v_invoice_metadata
  )
  returning id into v_invoice_id;

  update public.subscriptions
  set
    last_invoice_id = v_invoice_id,
    updated_at = now()
  where tenant_id = p_tenant_id;

  return v_invoice_id;
end;
$function$;
