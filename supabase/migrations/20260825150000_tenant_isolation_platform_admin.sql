-- Tenant isolation: stop user_roles from re-granting default-tenant access.
-- Platform admin bootstrap: single authorized Super Admin UID.

DROP TRIGGER IF EXISTS sync_user_roles_to_default_tenant_trigger ON public.user_roles;

-- Users linked to another active company should not keep default-tenant membership.
DELETE FROM public.tenant_memberships tm
WHERE tm.tenant_id = 'a0000001-0000-4000-8000-000000000001'::uuid
  AND EXISTS (
    SELECT 1
    FROM public.tenant_memberships other
    WHERE other.user_id = tm.user_id
      AND other.tenant_id != tm.tenant_id
      AND other.status = 'active'::public.membership_status
  );

-- Restrict Super Admin access to the bootstrap UID (managed via Super Admin UI afterwards).
DELETE FROM public.platform_admins
WHERE user_id <> '23d5368c-ed33-4d64-92b1-8cab087518b4'::uuid;

INSERT INTO public.platform_admins (user_id, created_by)
VALUES ('23d5368c-ed33-4d64-92b1-8cab087518b4'::uuid, NULL)
ON CONFLICT (user_id) DO NOTHING;
