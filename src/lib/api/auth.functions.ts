import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseTenantSettings } from "@/lib/tenant-settings";

const tenantSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido.");

export type TenantLoginBranding = {
  id: string;
  name: string;
  slug: string;
  panelLogoUrl: string | null;
};

/** Public branding for company-specific login pages. */
export const getTenantLoginBranding = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ slug: tenantSlugSchema }).parse(input))
  .handler(async ({ data }): Promise<TenantLoginBranding> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const slug = data.slug.trim().toLowerCase();

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status, settings")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!tenant || tenant.status !== "active") {
      throw new Error("NOT_FOUND");
    }

    const settings = parseTenantSettings(tenant.settings);
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      panelLogoUrl: settings.panelLogoUrl,
    };
  });

export function buildTenantLoginPath(slug: string): string {
  return `/auth/${slug.trim().toLowerCase()}`;
}

export function buildTenantLoginUrl(slug: string, origin?: string): string {
  const base = origin?.replace(/\/$/, "") ?? "";
  return `${base}${buildTenantLoginPath(slug)}`;
}
