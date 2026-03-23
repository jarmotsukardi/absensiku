-- Fix Vault read path: use decrypted_secret instead of encrypted secret.

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

  select ds.decrypted_secret, ds.updated_at
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
  select ds.decrypted_secret
    into v_secret
  from vault.decrypted_secrets ds
  where ds.name = 'homepage_chat_agent_gemini_api_key'
  order by ds.updated_at desc
  limit 1;

  return coalesce(v_secret, '');
end;
$$;

revoke all on function public.get_homepage_chat_agent_gemini_key_status() from public, anon;
grant execute on function public.get_homepage_chat_agent_gemini_key_status() to authenticated, service_role;

revoke all on function public.get_homepage_chat_agent_gemini_api_key() from public, anon, authenticated;
grant execute on function public.get_homepage_chat_agent_gemini_api_key() to service_role;
