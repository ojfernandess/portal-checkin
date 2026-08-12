-- Rastreamento de duração do fluxo de check-in (início → conclusão)
ALTER TABLE public.checkin_records
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_checkin_records_started_at
  ON public.checkin_records (started_at DESC)
  WHERE started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.checkin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  localizer text NOT NULL,
  reservation_id text,
  establishment_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  checkin_record_id uuid REFERENCES public.checkin_records (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_localizer_started
  ON public.checkin_sessions (localizer, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkin_sessions_open
  ON public.checkin_sessions (localizer)
  WHERE completed_at IS NULL;

GRANT ALL ON public.checkin_sessions TO service_role;
GRANT SELECT ON public.checkin_sessions TO authenticated;
ALTER TABLE public.checkin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read checkin sessions"
  ON public.checkin_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages checkin sessions"
  ON public.checkin_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
