-- Public numeric identifier for tenants (display + Super Admin URLs; internal PK remains uuid).

CREATE SEQUENCE IF NOT EXISTS public.tenants_public_number_seq;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS public_number bigint;

UPDATE public.tenants
SET public_number = nextval('public.tenants_public_number_seq')
WHERE public_number IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN public_number SET DEFAULT nextval('public.tenants_public_number_seq'),
  ALTER COLUMN public_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenants_public_number_unique'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_public_number_unique UNIQUE (public_number);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tenants_public_number ON public.tenants (public_number);
