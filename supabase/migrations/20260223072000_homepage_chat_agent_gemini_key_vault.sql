-- Store Homepage Chat Agent Gemini API key securely in Supabase Vault,
-- while exposing only non-sensitive status to super admins.

create or replace function public.set_homepage_chat_agent_gemini_api_key(p_api_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_trimmed_key text := btrim(coalesce(p_api_key, ''));
  v_now timestamptz := now();
  v_existing_id uuid;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if not is_super_admin(v_actor) then
    raise exception 'Hanya super admin yang diizinkan mengganti API key Gemini';
  end if;

  if v_trimmed_key = '' then
    raise exception 'API key Gemini wajib diisi';
  end if;

  if v_trimmed_key !~ '^AIza[0-9A-Za-z_-]{20,}$' then
    raise exception 'Format API key Gemini tidak valid';
  end if;

  select ds.id
    into v_existing_id
  from vault.decrypted_secrets ds
  where ds.name = 'homepage_chat_agent_gemini_api_key'
  order by ds.updated_at desc
  limit 1;

  if v_existing_id is null then
    perform vault.create_secret(
      v_trimmed_key,
      'homepage_chat_agent_gemini_api_key',
      'Gemini API key untuk homepage chat agent',
      null
    );
  else
    perform vault.update_secret(
      v_existing_id,
      v_trimmed_key,
      'homepage_chat_agent_gemini_api_key',
      'Gemini API key untuk homepage chat agent',
      null
    );
  end if;

  insert into public.system_settings (key, value, description, updated_at, updated_by)
  values (
    'homepage_chat_agent_secure_meta',
    jsonb_build_object(
      'gemini_key_configured', true,
      'gemini_key_last_rotated_at', v_now
    ),
    'Metadata keamanan chat agent (tanpa nilai rahasia)',
    v_now,
    v_actor
  )
  on conflict (key) do update
    set value = coalesce(public.system_settings.value, '{}'::jsonb) || jsonb_build_object(
      'gemini_key_configured', true,
      'gemini_key_last_rotated_at', v_now
    ),
    description = excluded.description,
    updated_at = v_now,
    updated_by = v_actor;

  return jsonb_build_object(
    'success', true,
    'configured', true,
    'last4', right(v_trimmed_key, 4),
    'updated_at', v_now
  );
end;
$$;

create or replace function public.get_homepage_chat_agent_gemini_key_status()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, auth, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_secret text;
  v_updated_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if not is_super_admin(v_actor) then
    raise exception 'Hanya super admin yang diizinkan melihat status API key Gemini';
  end if;

  select ds.secret, ds.updated_at
    into v_secret, v_updated_at
  from vault.decrypted_secrets ds
  where ds.name = 'homepage_chat_agent_gemini_api_key'
  order by ds.updated_at desc
  limit 1;

  if coalesce(v_secret, '') = '' then
    return jsonb_build_object(
      'configured', false,
      'last4', null,
      'updated_at', null
    );
  end if;

  return jsonb_build_object(
    'configured', true,
    'last4', right(v_secret, 4),
    'updated_at', v_updated_at
  );
end;
$$;

create or replace function public.get_homepage_chat_agent_gemini_api_key()
returns text
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_secret text;
begin
  select ds.secret
    into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'homepage_chat_agent_gemini_api_key'
  order by ds.updated_at desc
  limit 1;

  return coalesce(v_secret, '');
end;
$$;

revoke all on function public.set_homepage_chat_agent_gemini_api_key(text) from public, anon;
grant execute on function public.set_homepage_chat_agent_gemini_api_key(text) to authenticated, service_role;

revoke all on function public.get_homepage_chat_agent_gemini_key_status() from public, anon;
grant execute on function public.get_homepage_chat_agent_gemini_key_status() to authenticated, service_role;

revoke all on function public.get_homepage_chat_agent_gemini_api_key() from public, anon, authenticated;
grant execute on function public.get_homepage_chat_agent_gemini_api_key() to service_role;
