/**
 * Server-only replacement for @tanstack/start-client-core/createCsrfMiddleware.
 * The stock export uses createIsomorphicFn(); Nitro's SSR bundle on Linux can resolve
 * createMiddleware incorrectly at module init (defaultCsrfMiddleware), crashing the app.
 */

export const csrfSymbol = Symbol.for("tanstack-start:csrf-middleware");

type CsrfCtx = {
  handlerType?: string;
  request: Request;
  next: () => Promise<unknown>;
};

export type CsrfMiddlewareOptions = {
  filter?: (ctx: CsrfCtx) => boolean | Promise<boolean>;
  secFetchSite?: string | string[] | ((value: string, ctx: CsrfCtx) => boolean | Promise<boolean>);
  origin?: string | string[] | ((value: string, ctx: CsrfCtx) => boolean | Promise<boolean>);
  referer?: boolean | ((referer: string, ctx: CsrfCtx) => boolean | Promise<boolean>);
  allowRequestsWithoutOriginCheck?: boolean;
  failureResponse?: Response | ((ctx: CsrfCtx) => Response | Promise<Response>);
};

export function createCsrfMiddleware(opts: CsrfMiddlewareOptions = {}) {
  return {
    options: {
      type: "request" as const,
      server: async (ctx: CsrfCtx) => {
        if (opts.filter && !(await opts.filter(ctx))) {
          return ctx.next();
        }
        if (await isCsrfRequestAllowed(opts, ctx)) {
          return ctx.next();
        }
        return getFailureResponse(opts, ctx);
      },
    },
  };
}

export async function isCsrfRequestAllowed(
  opts: CsrfMiddlewareOptions,
  ctx: CsrfCtx,
): Promise<boolean> {
  const result = await getCsrfRequestValidationResult(opts, ctx);
  return (
    result === true ||
    (result === undefined && opts.allowRequestsWithoutOriginCheck === true)
  );
}

export async function getCsrfRequestValidationResult(
  opts: CsrfMiddlewareOptions,
  ctx: CsrfCtx,
): Promise<boolean | undefined> {
  const fetchSite = ctx.request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null) {
    return matchValue(opts.secFetchSite ?? "same-origin", fetchSite, ctx);
  }

  const origin = ctx.request.headers.get("Origin");
  if (origin !== null) {
    if (opts.origin) return matchValue(opts.origin, origin, ctx);
    return origin === new URL(ctx.request.url).origin;
  }

  const referer = ctx.request.headers.get("Referer");
  if (referer === null || opts.referer === false) {
    return undefined;
  }

  if (typeof opts.referer === "function") {
    return opts.referer(referer, ctx);
  }

  if (opts.origin) {
    const refererOrigin = getOriginFromUrl(referer);
    return refererOrigin !== undefined && matchValue(opts.origin, refererOrigin, ctx);
  }

  return isRefererSameOrigin(referer, new URL(ctx.request.url).origin);
}

async function matchValue(
  matcher: CsrfMiddlewareOptions["secFetchSite"],
  value: string,
  ctx: CsrfCtx,
): Promise<boolean> {
  if (typeof matcher === "function") return matcher(value, ctx);
  if (Array.isArray(matcher)) return matcher.includes(value);
  return value === matcher;
}

function getOriginFromUrl(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function isRefererSameOrigin(referer: string, requestOrigin: string): boolean {
  if (referer === requestOrigin) return true;
  if (!referer.startsWith(requestOrigin)) return false;
  if (referer.length === requestOrigin.length) return true;
  const code = referer.charCodeAt(requestOrigin.length);
  return code === 47 || code === 63 || code === 35;
}

async function getFailureResponse(opts: CsrfMiddlewareOptions, ctx: CsrfCtx): Promise<Response> {
  if (typeof opts.failureResponse === "function") {
    return opts.failureResponse(ctx);
  }
  return opts.failureResponse?.clone() ?? new Response("Forbidden", { status: 403 });
}
