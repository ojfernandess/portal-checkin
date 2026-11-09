-- PMS VB (Vinibarr) + vínculo de fotos do portal de check-in

INSERT INTO public.platform_integrations (id, integration_type, name, description)
VALUES ('vb', 'pms', 'PMS VB', 'Integração Vinibarr / VB (TecHospitality-compatible API)')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.guest_portal_photos (
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

CREATE INDEX IF NOT EXISTS guest_portal_photos_tenant_est_doc_idx
  ON public.guest_portal_photos (tenant_id, establishment_id, document_number)
  WHERE document_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_portal_photos_tenant_est_email_idx
  ON public.guest_portal_photos (tenant_id, establishment_id, email)
  WHERE email IS NOT NULL;

ALTER TABLE public.guest_portal_photos ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.guest_portal_photos TO service_role;
