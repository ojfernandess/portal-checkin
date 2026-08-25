-- Phase 3: enforce tenant_id NOT NULL + tenant-scoped RLS (defense in depth)
-- Safe to run after Phase 1 backfill. Idempotent backfill included.

DO $$
DECLARE
  default_tenant uuid := 'a0000001-0000-4000-8000-000000000001'::uuid;
BEGIN
  UPDATE public.establishments SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.establishment_terms SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.establishment_terms_history SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.establishment_contacts SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.establishment_settings SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.establishment_extra_fields SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.staff_establishments SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.checkin_records SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.checkin_sessions SET tenant_id = default_tenant WHERE tenant_id IS NULL;
END
$$;

ALTER TABLE public.establishments
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.establishment_terms
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.establishment_terms_history
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.establishment_contacts
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.establishment_settings
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.establishment_extra_fields
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.staff_establishments
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.checkin_records
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.checkin_sessions
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_tenant_role(_user_id, _tenant_id, 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant_row(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_tenant_membership(_user_id, _tenant_id)
$$;

-- establishments
DROP POLICY IF EXISTS "Anyone can read establishments" ON public.establishments;
DROP POLICY IF EXISTS "Admins manage establishments" ON public.establishments;

CREATE POLICY "Anyone can read establishments"
  ON public.establishments FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tenant admins manage establishments"
  ON public.establishments FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- establishment_terms
DROP POLICY IF EXISTS "Anyone can read establishment terms" ON public.establishment_terms;
DROP POLICY IF EXISTS "Admins manage establishment terms" ON public.establishment_terms;

CREATE POLICY "Anyone can read establishment terms"
  ON public.establishment_terms FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tenant admins manage establishment terms"
  ON public.establishment_terms FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- establishment_contacts
DROP POLICY IF EXISTS "Anyone can read establishment contacts" ON public.establishment_contacts;
DROP POLICY IF EXISTS "Admins manage establishment contacts" ON public.establishment_contacts;

CREATE POLICY "Anyone can read establishment contacts"
  ON public.establishment_contacts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tenant admins manage establishment contacts"
  ON public.establishment_contacts FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- establishment_settings
DROP POLICY IF EXISTS "Anyone can read establishment settings" ON public.establishment_settings;
DROP POLICY IF EXISTS "Admins manage establishment settings" ON public.establishment_settings;

CREATE POLICY "Anyone can read establishment settings"
  ON public.establishment_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tenant admins manage establishment settings"
  ON public.establishment_settings FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- establishment_extra_fields
DROP POLICY IF EXISTS "Anyone can read extra fields" ON public.establishment_extra_fields;
DROP POLICY IF EXISTS "Admins manage extra fields" ON public.establishment_extra_fields;

CREATE POLICY "Anyone can read extra fields"
  ON public.establishment_extra_fields FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Tenant admins manage extra fields"
  ON public.establishment_extra_fields FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- staff_establishments
DROP POLICY IF EXISTS "Staff view own establishment assignments" ON public.staff_establishments;
DROP POLICY IF EXISTS "Admins manage staff establishments" ON public.staff_establishments;

CREATE POLICY "Tenant staff view establishment assignments"
  ON public.staff_establishments FOR SELECT
  TO authenticated
  USING (
    public.can_access_tenant_row(auth.uid(), tenant_id)
    AND (auth.uid() = user_id OR public.is_tenant_admin(auth.uid(), tenant_id))
  );

CREATE POLICY "Tenant admins manage staff establishments"
  ON public.staff_establishments FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- checkin_records
DROP POLICY IF EXISTS "Staff read checkin records" ON public.checkin_records;

CREATE POLICY "Tenant staff read checkin records"
  ON public.checkin_records FOR SELECT
  TO authenticated
  USING (public.can_access_tenant_row(auth.uid(), tenant_id));

-- checkin_sessions
DROP POLICY IF EXISTS "Staff read checkin sessions" ON public.checkin_sessions;

CREATE POLICY "Tenant staff read checkin sessions"
  ON public.checkin_sessions FOR SELECT
  TO authenticated
  USING (public.can_access_tenant_row(auth.uid(), tenant_id));

-- audit_logs
DROP POLICY IF EXISTS "Admins view audit logs" ON public.audit_logs;

CREATE POLICY "Tenant admins view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    (
      tenant_id IS NULL
      AND (
        public.is_platform_admin(auth.uid())
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    )
    OR (
      tenant_id IS NOT NULL
      AND public.is_tenant_admin(auth.uid(), tenant_id)
    )
  );

-- app_settings (global — platform admins / legacy global admins only)
DROP POLICY IF EXISTS "Admins manage app settings" ON public.app_settings;

CREATE POLICY "Platform or global admins manage app settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- tenant_memberships (tenant admins manage their tenant's staff links)
DROP POLICY IF EXISTS "Users view own tenant memberships" ON public.tenant_memberships;

CREATE POLICY "Users view own tenant memberships"
  ON public.tenant_memberships FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_platform_admin(auth.uid())
    OR public.is_tenant_admin(auth.uid(), tenant_id)
  );

CREATE POLICY "Tenant admins manage tenant memberships"
  ON public.tenant_memberships FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- establishment_terms_history (staff read via tenant; writes via service role / tenant admin)
DROP POLICY IF EXISTS "Tenant staff read establishment terms history" ON public.establishment_terms_history;

CREATE POLICY "Tenant staff read establishment terms history"
  ON public.establishment_terms_history FOR SELECT
  TO authenticated
  USING (public.can_access_tenant_row(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage establishment terms history"
  ON public.establishment_terms_history FOR ALL
  TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
