/**
 * Separação de domínios:
 * - checkin.audaar.com.br → portal público de check-in (/, /LOCALIZADOR)
 * - checkin.techospitality.com → login e painel admin (/auth, /admin/*)
 *
 * Configure PUBLIC_CHECKIN_ORIGIN e ADMIN_PANEL_ORIGIN no EasyPanel.
 * Remova redirecionamentos de domínio no proxy — ambos os hosts devem apontar
 * para o mesmo serviço; esta camada decide o redirect por path.
 */

const DEFAULT_PUBLIC_ORIGIN = "https://checkin.audaar.com.br";
const DEFAULT_ADMIN_ORIGIN = "https://checkin.techospitality.com";

const STATIC_PATH =
  /\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|txt|xml|json)$/i;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function normalizeOrigin(raw: string): string {
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.origin;
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/:\d+$/, "");
}

function hostFromOrigin(origin: string): string {
  return normalizeHost(new URL(origin).hostname);
}

function getConfiguredOrigins(): { publicOrigin: string; adminOrigin: string } | null {
  const publicOrigin = normalizeOrigin(
    readEnv("PUBLIC_CHECKIN_ORIGIN") ?? DEFAULT_PUBLIC_ORIGIN,
  );
  const adminOrigin = normalizeOrigin(readEnv("ADMIN_PANEL_ORIGIN") ?? DEFAULT_ADMIN_ORIGIN);

  if (hostFromOrigin(publicOrigin) === hostFromOrigin(adminOrigin)) {
    return null;
  }

  return { publicOrigin, adminOrigin };
}

function getRequestHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host");
  if (forwarded) {
    return normalizeHost(forwarded.split(",")[0].trim());
  }
  return normalizeHost(new URL(request.url).hostname);
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

function shouldBypassRouting(request: Request, pathname: string): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  if (pathname.startsWith("/_")) return true;
  if (STATIC_PATH.test(pathname)) return true;
  return false;
}

function isAdminPath(pathname: string): boolean {
  if (pathname === "/auth") return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname === "/admin") return true;
  if (pathname.startsWith("/admin/")) return true;
  if (pathname === "/platform") return true;
  if (pathname.startsWith("/platform/")) return true;
  return false;
}

function buildRedirectResponse(targetOrigin: string, request: Request): Response {
  const source = new URL(request.url);
  const target = new URL(source.pathname + source.search, targetOrigin);
  return new Response(null, {
    status: 308,
    headers: {
      Location: target.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}

export function applyDomainRouting(request: Request): Response | null {
  const config = getConfiguredOrigins();
  if (!config) return null;

  const { publicOrigin, adminOrigin } = config;
  const publicHost = hostFromOrigin(publicOrigin);
  const adminHost = hostFromOrigin(adminOrigin);
  const requestHost = getRequestHost(request);
  const pathname = new URL(request.url).pathname;

  if (isLocalHost(requestHost)) return null;
  if (shouldBypassRouting(request, pathname)) return null;

  const onPublicHost = requestHost === publicHost;
  const onAdminHost = requestHost === adminHost;

  if (!onPublicHost && !onAdminHost) return null;

  if (onPublicHost && isAdminPath(pathname)) {
    return buildRedirectResponse(adminOrigin, request);
  }

  if (onAdminHost && !isAdminPath(pathname)) {
    return buildRedirectResponse(publicOrigin, request);
  }

  return null;
}
