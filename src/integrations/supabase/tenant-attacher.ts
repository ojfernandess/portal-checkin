import { createMiddleware } from "@tanstack/react-start";
import { getStoredActiveTenantId } from "@/lib/tenant-context";

export const attachTenantContext = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const tenantId = getStoredActiveTenantId();
    return next({
      headers: tenantId ? { "X-Tenant-Id": tenantId } : {},
    });
  },
);
