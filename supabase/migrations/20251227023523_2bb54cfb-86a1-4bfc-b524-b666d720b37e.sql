-- Perbaikan aktivasi akun pegawai: linking employees.user_id ke auth user berdasarkan email & kode undangan

-- 1) Admin: link pegawai existing ke user yang sudah registrasi (lookup auth.users by email)
CREATE OR REPLACE FUNCTION public.admin_link_employee_user(
  p_employee_id uuid,
  p_user_email text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid;
  v_emp_tenant uuid;
  v_user_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT tenant_id INTO v_emp_tenant
  FROM public.employees
  WHERE id = p_employee_id;

  IF v_emp_tenant IS NULL THEN
    RAISE EXCEPTION 'Pegawai tidak ditemukan';
  END IF;

  IF NOT (
    public.is_super_admin(v_caller)
    OR (
      public.has_role(v_caller, 'admin_instansi'::public.app_role)
      AND public.get_user_tenant_id(v_caller) = v_emp_tenant
    )
  ) THEN
    RAISE EXCEPTION 'Tidak memiliki akses';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_user_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User dengan email % belum registrasi', p_user_email;
  END IF;

  UPDATE public.employees
  SET user_id = v_user_id,
      updated_at = now()
  WHERE id = p_employee_id;

  RETURN v_user_id;
END;
$$;

-- 2) Pegawai: finalize aktivasi dengan kode undangan (butuh undangan sudah diverifikasi admin)
CREATE OR REPLACE FUNCTION public.complete_employee_invitation_link(
  p_invite_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_inv public.employee_invitations%ROWTYPE;
  v_employee_id uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_inv
  FROM public.employee_invitations
  WHERE invitation_code = p_invite_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kode undangan tidak valid';
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Kode undangan sudah kedaluwarsa';
  END IF;

  IF COALESCE(v_inv.is_used, false) = true THEN
    RAISE EXCEPTION 'Kode undangan sudah digunakan';
  END IF;

  IF v_inv.status <> 'verified' THEN
    RAISE EXCEPTION 'Akun masih menunggu aktivasi admin';
  END IF;

  -- Cari employee existing (biasanya sudah dibuat oleh admin) berdasarkan email+tenant
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE tenant_id = v_inv.tenant_id
    AND lower(email) = lower(v_inv.email)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    INSERT INTO public.employees (
      user_id,
      tenant_id,
      name,
      email,
      nik,
      phone,
      office_id,
      opd_id,
      is_active
    ) VALUES (
      v_user,
      v_inv.tenant_id,
      v_inv.name,
      v_inv.email,
      v_inv.nik,
      v_inv.phone,
      v_inv.office_id,
      v_inv.opd_id,
      true
    )
    RETURNING id INTO v_employee_id;
  ELSE
    UPDATE public.employees
    SET user_id = v_user,
        office_id = COALESCE(office_id, v_inv.office_id),
        opd_id = COALESCE(opd_id, v_inv.opd_id),
        is_active = true,
        updated_at = now()
    WHERE id = v_employee_id;
  END IF;

  UPDATE public.employee_invitations
  SET is_used = true,
      used_at = now(),
      updated_at = now()
  WHERE id = v_inv.id;

  -- Pastikan role pegawai ada
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  SELECT v_user, v_inv.tenant_id, 'pegawai'::public.app_role
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_user
      AND ur.tenant_id = v_inv.tenant_id
      AND ur.role = 'pegawai'::public.app_role
  );

  RETURN v_employee_id;
END;
$$;
