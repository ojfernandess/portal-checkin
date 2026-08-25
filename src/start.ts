import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { attachTenantContext } from "@/integrations/supabase/tenant-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

function isRefererSameOrigin(referer: string, requestOrigin: string): boolean {
  if (referer === requestOrigin) return true;
  if (!referer.startsWith(requestOrigin)) return false;
  if (referer.length === requestOrigin.length) return true;
  const code = referer.charCodeAt(requestOrigin.length);
  return code === 47 || code === 63 || code === 35;
}

/** Server-only CSRF guard for serverFn RPC (avoids isomorphic createCsrfMiddleware bundling bug in Nitro). */
const csrfMiddleware = createMiddleware().server(async (ctx) => {
  if ((ctx as { handlerType?: string }).handlerType !== "serverFn") {
    return ctx.next();
  }

  const fetchSite = ctx.request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null) {
    if (fetchSite === "same-origin") return ctx.next();
    return new Response("Forbidden", { status: 403 });
  }

  const requestOrigin = new URL(ctx.request.url).origin;
  const origin = ctx.request.headers.get("Origin");
  if (origin !== null) {
    if (origin === requestOrigin) return ctx.next();
    return new Response("Forbidden", { status: 403 });
  }

  const referer = ctx.request.headers.get("Referer");
  if (referer !== null && isRefererSameOrigin(referer, requestOrigin)) {
    return ctx.next();
  }

  return new Response("Forbidden", { status: 403 });
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, attachTenantContext],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
