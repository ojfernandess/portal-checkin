CREATE TABLE public.establishment_settings (
  establishment_id text PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.establishment_settings TO anon, authenticated;
GRANT ALL ON public.establishment_settings TO service_role;
ALTER TABLE public.establishment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read establishment settings"
  ON public.establishment_settings FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Admins manage establishment settings"
  ON public.establishment_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
