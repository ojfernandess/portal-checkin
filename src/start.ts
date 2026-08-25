import { createStart } from "@tanstack/react-start";

import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { attachTenantContext } from "@/integrations/supabase/tenant-attacher";

export const startInstance = createStart(async () => {
  const { getRequestMiddleware } = await import("@/lib/start-request-middleware.server");
  return {
    functionMiddleware: [attachSupabaseAuth, attachTenantContext],
    requestMiddleware: getRequestMiddleware(),
  };
});
