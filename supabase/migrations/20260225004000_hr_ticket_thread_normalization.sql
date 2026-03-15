-- Normalize HR ticket thread storage from feedback_reports.browser_info JSON
-- into dedicated relational tables for comments and status audits.

ALTER TABLE public.feedback_reports
DROP CONSTRAINT IF EXISTS feedback_reports_status_check;

ALTER TABLE public.feedback_reports
ADD CONSTRAINT feedback_reports_status_check
CHECK (
  status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text])
);

CREATE OR REPLACE FUNCTION public.try_parse_jsonb(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN p_text::jsonb;
EXCEPTION
  WHEN others THEN
    RETURN '{}'::jsonb;
END;
$$;

CREATE TABLE IF NOT EXISTS public.hr_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.feedback_reports(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_comment_id text,
  message text NOT NULL,
  author_name text NOT NULL,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_ticket_comments_source
  ON public.hr_ticket_comments(ticket_id, source_comment_id)
  WHERE source_comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_ticket_comments_ticket_created
  ON public.hr_ticket_comments(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_ticket_comments_tenant_created
  ON public.hr_ticket_comments(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.hr_ticket_status_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.feedback_reports(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_audit_id text,
  from_status text NOT NULL,
  to_status text NOT NULL,
  actor_name text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_ticket_status_audits_source
  ON public.hr_ticket_status_audits(ticket_id, source_audit_id)
  WHERE source_audit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_ticket_status_audits_ticket_created
  ON public.hr_ticket_status_audits(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_ticket_status_audits_tenant_created
  ON public.hr_ticket_status_audits(tenant_id, created_at DESC);

ALTER TABLE public.hr_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_ticket_status_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR ticket comments read" ON public.hr_ticket_comments;
CREATE POLICY "HR ticket comments read"
ON public.hr_ticket_comments
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR ticket comments write" ON public.hr_ticket_comments;
CREATE POLICY "HR ticket comments write"
ON public.hr_ticket_comments
FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

DROP POLICY IF EXISTS "HR ticket status audits read" ON public.hr_ticket_status_audits;
CREATE POLICY "HR ticket status audits read"
ON public.hr_ticket_status_audits
FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "HR ticket status audits write" ON public.hr_ticket_status_audits;
CREATE POLICY "HR ticket status audits write"
ON public.hr_ticket_status_audits
FOR ALL
USING (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'admin_instansi'::public.app_role)
  )
);

INSERT INTO public.hr_ticket_comments (
  ticket_id,
  tenant_id,
  source_comment_id,
  message,
  author_name,
  created_at
)
SELECT
  fr.id,
  fr.tenant_id,
  NULLIF(comment_item ->> 'id', ''),
  comment_item ->> 'message',
  COALESCE(NULLIF(comment_item ->> 'author', ''), 'System'),
  CASE
    WHEN COALESCE(comment_item ->> 'created_at', '') ~ '^\\d{4}-\\d{2}-\\d{2}T'
      THEN (comment_item ->> 'created_at')::timestamptz
    ELSE fr.created_at
  END
FROM public.feedback_reports fr
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(public.try_parse_jsonb(fr.browser_info) -> 'comments', '[]'::jsonb)
) AS comment_item
WHERE fr.feedback_type = 'ticket'
  AND fr.tenant_id IS NOT NULL
  AND COALESCE(comment_item ->> 'message', '') <> ''
ON CONFLICT DO NOTHING;

INSERT INTO public.hr_ticket_status_audits (
  ticket_id,
  tenant_id,
  source_audit_id,
  from_status,
  to_status,
  actor_name,
  note,
  created_at
)
SELECT
  fr.id,
  fr.tenant_id,
  NULLIF(audit_item ->> 'id', ''),
  COALESCE(NULLIF(audit_item ->> 'from_status', ''), fr.status),
  COALESCE(NULLIF(audit_item ->> 'to_status', ''), fr.status),
  COALESCE(NULLIF(audit_item ->> 'actor', ''), 'System'),
  NULLIF(audit_item ->> 'note', ''),
  CASE
    WHEN COALESCE(audit_item ->> 'at', '') ~ '^\\d{4}-\\d{2}-\\d{2}T'
      THEN (audit_item ->> 'at')::timestamptz
    ELSE fr.created_at
  END
FROM public.feedback_reports fr
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(public.try_parse_jsonb(fr.browser_info) -> 'status_history', '[]'::jsonb)
) AS audit_item
WHERE fr.feedback_type = 'ticket'
  AND fr.tenant_id IS NOT NULL
ON CONFLICT DO NOTHING;
