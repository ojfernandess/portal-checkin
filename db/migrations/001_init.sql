-- Welcome On Tap — consolidated schema for self-hosted PostgreSQL (no Supabase auth).
-- Merged from supabase/migrations in chronological order.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

CREATE TYPE public.app_role AS ENUM ('admin', 'reception');

CREATE TYPE public.tenant_status AS ENUM ('active', 'inactive', 'suspended');

CREATE TYPE public.membership_status AS ENUM ('active', 'inactive', 'invited');

-- ---------------------------------------------------------------------------
-- Identity (replaces Supabase auth.users)
-- ---------------------------------------------------------------------------

CREATE TABLE public.auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_users_email_unique UNIQUE (email)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES public.auth_users (id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth_users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_id_role_unique UNIQUE (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Multi-tenant core
-- ---------------------------------------------------------------------------

CREATE SEQUENCE public.tenants_public_number_seq;

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_number bigint NOT NULL DEFAULT nextval('public.tenants_public_number_seq'),
  name text NOT NULL,
  slug text NOT NULL,
  legal_name text,
  tax_id text,
  status public.tenant_status NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT tenants_slug_unique UNIQUE (slug),
  CONSTRAINT tenants_public_number_unique UNIQUE (public_number)
);

CREATE TABLE public.tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.auth_users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  status public.membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_memberships_unique_user UNIQUE (tenant_id, user_id)
);

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES public.auth_users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL
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

-- ---------------------------------------------------------------------------
-- Establishments & configuration
-- ---------------------------------------------------------------------------

CREATE TABLE public.establishments (
  establishment_id text PRIMARY KEY,
  name text NOT NULL,
  notes text,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  created_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_terms (
  establishment_id text PRIMARY KEY,
  establishment_name text,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_terms_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  content jsonb NOT NULL,
  version integer NOT NULL,
  edited_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_contacts (
  establishment_id text PRIMARY KEY,
  establishment_name text,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  phone text,
  whatsapp text,
  updated_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_extra_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'select', 'checkbox', 'date', 'phone')),
  required boolean NOT NULL DEFAULT false,
  options jsonb,
  step text NOT NULL DEFAULT 'form',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_settings (
  establishment_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth_users (id) ON DELETE CASCADE,
  establishment_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT staff_establishments_user_establishment_unique UNIQUE (user_id, establishment_id)
);

-- ---------------------------------------------------------------------------
-- Check-in
-- ---------------------------------------------------------------------------

CREATE TABLE public.checkin_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  localizer text NOT NULL,
  reservation_id text,
  establishment_id text,
  establishment_name text,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  guest_name text NOT NULL,
  guest_email text,
  guest_document text,
  guest_document_type text,
  guest_phone text,
  main_guest jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependents jsonb NOT NULL DEFAULT '[]'::jsonb,
  embratur jsonb,
  reservation_snapshot jsonb,
  extra_fields jsonb,
  terms_accepted boolean NOT NULL DEFAULT false,
  terms_accepted_at timestamptz,
  terms_version integer,
  started_at timestamptz,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checkin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  localizer text NOT NULL,
  reservation_id text,
  establishment_id text,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  checkin_record_id uuid REFERENCES public.checkin_records (id) ON DELETE SET NULL,
  selfie_validation_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Guest portal & photo validation
-- ---------------------------------------------------------------------------

CREATE TABLE public.guest_portal_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  establishment_id text NOT NULL,
  document_number text,
  email text,
  profile_object_key text,
  document_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_portal_photos_identity_check CHECK (
    document_number IS NOT NULL OR email IS NOT NULL
  )
);

CREATE TABLE public.face_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  checkin_session_id uuid REFERENCES public.checkin_sessions (id) ON DELETE SET NULL,
  guest_id text,
  status text NOT NULL,
  reason text,
  score numeric,
  provider text NOT NULL DEFAULT 'zepiris',
  processing_time_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- App-wide & ops
-- ---------------------------------------------------------------------------

CREATE TABLE public.app_settings (
  id text PRIMARY KEY DEFAULT 'global',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.auth_users (id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (optional; app may call from SQL)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(
  _user_id uuid,
  _tenant_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.user_id = _user_id
      AND tm.tenant_id = _tenant_id
      AND tm.role = _role
      AND tm.status = 'active'::public.membership_status
  );
$$;

CREATE OR REPLACE FUNCTION public.has_tenant_membership(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      WHERE tm.user_id = _user_id
        AND tm.tenant_id = _tenant_id
        AND tm.status = 'active'::public.membership_status
    );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_tenant_role(_user_id, _tenant_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant_row(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.is_platform_admin(_user_id)
    OR public.has_tenant_membership(_user_id, _tenant_id);
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_tenants_status ON public.tenants (status);
CREATE INDEX idx_tenants_public_number ON public.tenants (public_number);

CREATE INDEX idx_tenant_memberships_user ON public.tenant_memberships (user_id);
CREATE INDEX idx_tenant_memberships_tenant ON public.tenant_memberships (tenant_id);

CREATE INDEX idx_establishments_name ON public.establishments (name);
CREATE INDEX idx_establishments_tenant ON public.establishments (tenant_id);

CREATE INDEX idx_extra_fields_establishment ON public.establishment_extra_fields (establishment_id);

CREATE INDEX idx_terms_history_establishment ON public.establishment_terms_history (establishment_id, version DESC);

CREATE INDEX idx_checkin_records_checked_in_at ON public.checkin_records (checked_in_at DESC);
CREATE INDEX idx_checkin_records_localizer ON public.checkin_records (localizer);
CREATE INDEX idx_checkin_records_establishment ON public.checkin_records (establishment_id);
CREATE INDEX idx_checkin_records_guest_name ON public.checkin_records (guest_name);
CREATE INDEX idx_checkin_records_started_at ON public.checkin_records (started_at DESC)
  WHERE started_at IS NOT NULL;
CREATE INDEX idx_checkin_records_tenant ON public.checkin_records (tenant_id);

CREATE INDEX idx_checkin_sessions_localizer_started ON public.checkin_sessions (localizer, started_at DESC);
CREATE INDEX idx_checkin_sessions_open ON public.checkin_sessions (localizer)
  WHERE completed_at IS NULL;
CREATE INDEX idx_checkin_sessions_tenant ON public.checkin_sessions (tenant_id);

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs (tenant_id);

CREATE INDEX guest_portal_photos_tenant_est_doc_idx
  ON public.guest_portal_photos (tenant_id, establishment_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX guest_portal_photos_tenant_est_email_idx
  ON public.guest_portal_photos (tenant_id, establishment_id, email)
  WHERE email IS NOT NULL;

CREATE INDEX idx_face_validation_logs_tenant
  ON public.face_validation_logs (tenant_id, created_at DESC);

CREATE INDEX idx_face_validation_logs_session
  ON public.face_validation_logs (checkin_session_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Reference data (integration catalog + global settings row)
-- ---------------------------------------------------------------------------

INSERT INTO public.platform_integrations (id, integration_type, name, description)
VALUES
  ('vivakey', 'pms', 'PMS Vivakey', 'Integração TecHospitality / Vivakey'),
  ('inbox', 'portaria', 'Inbox Seg', 'Portaria digital Inbox Seg'),
  ('vb', 'pms', 'PMS VB', 'Integração Vinibarr / VB (TecHospitality-compatible API)');

INSERT INTO public.app_settings (id, settings) VALUES ('global', '{}'::jsonb);
