-- Phase 1: Multi-tenant foundation (additive, non-breaking)
-- Creates tenant model, backfills existing data to "Audaar - Vivakey", keeps user_roles intact.

-- Fixed UUID for the first tenant (reproducible across environments).
-- Do NOT change without a dedicated data migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END
$$;

CREATE TYPE public.tenant_status AS ENUM ('active', 'inactive', 'suspended');

CREATE TYPE public.membership_status AS ENUM ('active', 'inactive', 'invited');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  legal_name text,
  tax_id text,
  status public.tenant_status NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT tenants_slug_unique UNIQUE (slug)
);

CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_unique_user UNIQUE (tenant_id, user_id)
);

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE public.platform_integrations (
  id text PRIMARY KEY,
  integration_type text NOT NULL CHECK (integration_type IN ('pms', 'portaria')),
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_pms_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  provider text NOT NULL REFERENCES public.platform_integrations (id) ON DELETE RESTRICT,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_pms_configs_unique_provider UNIQUE (tenant_id, provider)
);

CREATE TABLE public.tenant_portaria_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  provider text NOT NULL REFERENCES public.platform_integrations (id) ON DELETE RESTRICT,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_portaria_configs_unique_provider UNIQUE (tenant_id, provider)
);

CREATE TABLE public.tenant_features (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

-- Seed platform integration catalog
INSERT INTO public.platform_integrations (id, integration_type, name, description)
VALUES
  ('vivakey', 'pms', 'PMS Vivakey', 'Integração TecHospitality / Vivakey'),
  ('inbox', 'portaria', 'Inbox Seg', 'Portaria digital Inbox Seg')
ON CONFLICT (id) DO NOTHING;

-- First tenant: all existing data belongs here
INSERT INTO public.tenants (id, name, slug, legal_name, status)
VALUES (
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'Audaar - Vivakey',
  'audaar-vivakey',
  'Audaar - Vivakey',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- Default feature flags for the first tenant (matches current production capabilities)
INSERT INTO public.tenant_features (tenant_id, feature_key, enabled)
VALUES
  ('a0000001-0000-4000-8000-000000000001'::uuid, 'pms_vivakey', true),
  ('a0000001-0000-4000-8000-000000000001'::uuid, 'portaria_inbox', true)
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

-- Backfill memberships from existing user_roles (admin wins over reception)
INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
SELECT
  'a0000001-0000-4000-8000-000000000001'::uuid,
  ur.user_id,
  CASE
    WHEN bool_or(ur.role = 'admin'::public.app_role) THEN 'admin'::public.app_role
    ELSE 'reception'::public.app_role
  END,
  'active'::public.membership_status
FROM public.user_roles ur
GROUP BY ur.user_id
ON CONFLICT (tenant_id, user_id) DO UPDATE
SET
  role = EXCLUDED.role,
  status = 'active'::public.membership_status,
  updated_at = now();

-- Tenant scope on business tables (nullable during transition)
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.establishment_terms
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.establishment_terms_history
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.establishment_contacts
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.establishment_settings
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.establishment_extra_fields
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.staff_establishments
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.checkin_records
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.checkin_sessions
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL;

-- Backfill tenant_id on all existing rows
UPDATE public.establishments
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE tenant_id IS NULL;

UPDATE public.establishment_terms et
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE et.establishment_id = e.establishment_id
  AND et.tenant_id IS NULL;

UPDATE public.establishment_terms et
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE et.tenant_id IS NULL;

UPDATE public.establishment_terms_history eth
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE eth.establishment_id = e.establishment_id
  AND eth.tenant_id IS NULL;

UPDATE public.establishment_terms_history eth
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE eth.tenant_id IS NULL;

UPDATE public.establishment_contacts ec
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE ec.establishment_id = e.establishment_id
  AND ec.tenant_id IS NULL;

UPDATE public.establishment_contacts ec
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE ec.tenant_id IS NULL;

UPDATE public.establishment_settings es
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE es.establishment_id = e.establishment_id
  AND es.tenant_id IS NULL;

UPDATE public.establishment_settings es
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE es.tenant_id IS NULL;

UPDATE public.establishment_extra_fields eef
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE eef.establishment_id = e.establishment_id
  AND eef.tenant_id IS NULL;

UPDATE public.establishment_extra_fields eef
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE eef.tenant_id IS NULL;

UPDATE public.staff_establishments se
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE se.establishment_id = e.establishment_id
  AND se.tenant_id IS NULL;

UPDATE public.staff_establishments se
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE se.tenant_id IS NULL;

UPDATE public.checkin_records cr
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE cr.establishment_id = e.establishment_id
  AND cr.tenant_id IS NULL;

UPDATE public.checkin_records cr
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE cr.tenant_id IS NULL;

UPDATE public.checkin_sessions cs
SET tenant_id = e.tenant_id
FROM public.establishments e
WHERE cs.establishment_id = e.establishment_id
  AND cs.tenant_id IS NULL;

UPDATE public.checkin_sessions cs
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE cs.tenant_id IS NULL;

UPDATE public.audit_logs
SET tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
WHERE tenant_id IS NULL;

-- Indexes for future tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants (status);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON public.tenant_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON public.tenant_memberships (tenant_id);
CREATE INDEX IF NOT EXISTS idx_establishments_tenant ON public.establishments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkin_records_tenant ON public.checkin_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkin_sessions_tenant ON public.checkin_sessions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs (tenant_id);

-- Helper functions (used from Phase 2 onward)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(
  _user_id uuid,
  _tenant_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.user_id = _user_id
      AND tm.tenant_id = _tenant_id
      AND tm.role = _role
      AND tm.status = 'active'::public.membership_status
  )
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_membership(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = _user_id
        AND tm.tenant_id = _tenant_id
        AND tm.status = 'active'::public.membership_status
    )
$$;

-- Keep user_roles and tenant_memberships in sync for the default tenant during transition.
CREATE OR REPLACE FUNCTION public.sync_user_roles_to_default_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_tenant uuid := 'a0000001-0000-4000-8000-000000000001'::uuid;
  resolved_role public.app_role;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur WHERE ur.user_id = OLD.user_id
    ) THEN
      DELETE FROM public.tenant_memberships
      WHERE tenant_id = default_tenant
        AND user_id = OLD.user_id;
    ELSE
      SELECT CASE
        WHEN bool_or(role = 'admin'::public.app_role) THEN 'admin'::public.app_role
        ELSE 'reception'::public.app_role
      END
      INTO resolved_role
      FROM public.user_roles ur
      WHERE ur.user_id = OLD.user_id;

      UPDATE public.tenant_memberships
      SET role = resolved_role, updated_at = now()
      WHERE tenant_id = default_tenant
        AND user_id = OLD.user_id;
    END IF;

    RETURN OLD;
  END IF;

  SELECT CASE
    WHEN bool_or(role = 'admin'::public.app_role) THEN 'admin'::public.app_role
    ELSE 'reception'::public.app_role
  END
  INTO resolved_role
  FROM public.user_roles ur
  WHERE ur.user_id = NEW.user_id;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
  VALUES (default_tenant, NEW.user_id, resolved_role, 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, status = 'active', updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_user_roles_to_default_tenant_trigger ON public.user_roles;
CREATE TRIGGER sync_user_roles_to_default_tenant_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_roles_to_default_tenant();

-- Extend signup trigger: also create default-tenant membership alongside user_roles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first boolean;
  assigned_role public.app_role;
  default_tenant uuid := 'a0000001-0000-4000-8000-000000000001'::uuid;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  assigned_role := CASE
    WHEN is_first THEN 'admin'::public.app_role
    ELSE 'reception'::public.app_role
  END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
  VALUES (default_tenant, NEW.id, assigned_role, 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, status = 'active', updated_at = now();

  RETURN NEW;
END;
$$;

-- Grants & RLS (new tables only — existing policies unchanged)
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

GRANT SELECT ON public.tenant_memberships TO authenticated;
GRANT ALL ON public.tenant_memberships TO service_role;

GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

GRANT SELECT ON public.platform_integrations TO authenticated;
GRANT ALL ON public.platform_integrations TO service_role;

GRANT SELECT ON public.tenant_pms_configs TO authenticated;
GRANT ALL ON public.tenant_pms_configs TO service_role;

GRANT SELECT ON public.tenant_portaria_configs TO authenticated;
GRANT ALL ON public.tenant_portaria_configs TO service_role;

GRANT SELECT ON public.tenant_features TO authenticated;
GRANT ALL ON public.tenant_features TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pms_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_portaria_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read active tenants"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (
    status = 'active'::public.tenant_status
    AND (
      public.is_platform_admin(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.tenant_memberships tm
        WHERE tm.tenant_id = tenants.id
          AND tm.user_id = auth.uid()
          AND tm.status = 'active'::public.membership_status
      )
    )
  );

CREATE POLICY "Users view own tenant memberships"
  ON public.tenant_memberships FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_platform_admin(auth.uid())
  );

CREATE POLICY "Platform admins view platform admins"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR auth.uid() = user_id);

CREATE POLICY "Anyone authenticated reads integration catalog"
  ON public.platform_integrations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Tenant members read tenant pms configs"
  ON public.tenant_pms_configs FOR SELECT
  TO authenticated
  USING (public.has_tenant_membership(auth.uid(), tenant_id));

CREATE POLICY "Tenant members read tenant portaria configs"
  ON public.tenant_portaria_configs FOR SELECT
  TO authenticated
  USING (public.has_tenant_membership(auth.uid(), tenant_id));

CREATE POLICY "Tenant members read tenant features"
  ON public.tenant_features FOR SELECT
  TO authenticated
  USING (public.has_tenant_membership(auth.uid(), tenant_id));
