-- ZepIris intelligent photo validation (selfie check-in)
-- Configuração via tenant_features (feature_key = zepiris_photo_validation).
-- Não usa platform_integrations (CHECK só permite 'pms' | 'portaria').

CREATE TABLE IF NOT EXISTS public.face_validation_logs (
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

CREATE INDEX IF NOT EXISTS idx_face_validation_logs_tenant
  ON public.face_validation_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_face_validation_logs_session
  ON public.face_validation_logs (checkin_session_id, created_at DESC);

ALTER TABLE public.checkin_sessions
  ADD COLUMN IF NOT EXISTS selfie_validation_attempts integer NOT NULL DEFAULT 0;

INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, config)
SELECT
  t.id,
  'zepiris_photo_validation',
  false,
  jsonb_build_object(
    'blurCheck', true,
    'spoofCheck', true,
    'nsfwCheck', false,
    'faceDetection', true,
    'maxAttempts', 5,
    'timeoutMs', 10000,
    'unavailablePolicy', 'BLOCK'
  )
FROM public.tenants t
ON CONFLICT (tenant_id, feature_key) DO NOTHING;

GRANT ALL ON public.face_validation_logs TO service_role;
ALTER TABLE public.face_validation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access face validation logs"
  ON public.face_validation_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
