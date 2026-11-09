-- Cadastro local de estabelecimentos (establishmentId vem da API de localizer TecHospitality)
CREATE TABLE public.establishments (
  establishment_id text PRIMARY KEY,
  name text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.establishments TO anon, authenticated;
GRANT ALL ON public.establishments TO service_role;
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read establishments"
  ON public.establishments FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Admins manage establishments"
  ON public.establishments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_establishments_name ON public.establishments (name);
