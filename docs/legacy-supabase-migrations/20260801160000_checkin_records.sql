-- Registro local de check-ins concluídos (independente da API TecHospitality)
CREATE TABLE public.checkin_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  localizer text NOT NULL,
  reservation_id text,
  establishment_id text,
  establishment_name text,
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
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkin_records_checked_in_at ON public.checkin_records (checked_in_at DESC);
CREATE INDEX idx_checkin_records_localizer ON public.checkin_records (localizer);
CREATE INDEX idx_checkin_records_establishment ON public.checkin_records (establishment_id);
CREATE INDEX idx_checkin_records_guest_name ON public.checkin_records (guest_name);

GRANT ALL ON public.checkin_records TO service_role;
GRANT SELECT ON public.checkin_records TO authenticated;
ALTER TABLE public.checkin_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read checkin records"
  ON public.checkin_records FOR SELECT
  TO authenticated
  USING (true);

-- Inserções apenas pelo backend (service_role)
CREATE POLICY "Service role manages checkin records"
  ON public.checkin_records FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
