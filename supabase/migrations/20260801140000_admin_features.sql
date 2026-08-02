-- Terms per establishment (current version)
CREATE TABLE public.establishment_terms (
  establishment_id text PRIMARY KEY,
  establishment_name text,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_terms_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id text NOT NULL,
  content jsonb NOT NULL,
  version integer NOT NULL,
  edited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_contacts (
  establishment_id text PRIMARY KEY,
  establishment_name text,
  phone text,
  whatsapp text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.establishment_extra_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'select', 'checkbox', 'date', 'phone')),
  required boolean NOT NULL DEFAULT false,
  options jsonb,
  step text NOT NULL DEFAULT 'form',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id text NOT NULL,
  UNIQUE (user_id, establishment_id)
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.establishment_terms TO anon, authenticated;
GRANT ALL ON public.establishment_terms TO service_role;
ALTER TABLE public.establishment_terms ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.establishment_contacts TO anon, authenticated;
GRANT ALL ON public.establishment_contacts TO service_role;
ALTER TABLE public.establishment_contacts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.establishment_extra_fields TO anon, authenticated;
GRANT ALL ON public.establishment_extra_fields TO service_role;
ALTER TABLE public.establishment_extra_fields ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.staff_establishments TO authenticated;
GRANT ALL ON public.staff_establishments TO service_role;
ALTER TABLE public.staff_establishments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.establishment_terms_history TO service_role;
ALTER TABLE public.establishment_terms_history ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.rate_limit_buckets TO service_role;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read establishment terms"
  ON public.establishment_terms FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Admins manage establishment terms"
  ON public.establishment_terms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read establishment contacts"
  ON public.establishment_contacts FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Admins manage establishment contacts"
  ON public.establishment_contacts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read extra fields"
  ON public.establishment_extra_fields FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Admins manage extra fields"
  ON public.establishment_extra_fields FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff view own establishment assignments"
  ON public.staff_establishments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage staff establishments"
  ON public.staff_establishments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_extra_fields_establishment ON public.establishment_extra_fields (establishment_id);
CREATE INDEX idx_terms_history_establishment ON public.establishment_terms_history (establishment_id, version DESC);
