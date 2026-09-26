import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePlatformAdmin } from "@/integrations/supabase/platform-middleware";
import { writeAuditLog } from "@/lib/audit";
import {
  maskToken,
  normalizeTenantPmsConfig,
  tenantPmsConfigForSave,
  type TenantPmsTokenConfig,
} from "@/lib/tenant-pms.server";

export type PlatformTenantStatus = "active" | "inactive" | "suspended";

export type PlatformTenantSummary = {
  publicNumber: number;
  name: string;
  slug: string;
  status: PlatformTenantStatus;
  legalName: string | null;
  taxId: string | null;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
  establishmentCount: number;
};

export type PlatformTenantFeature = {
  featureKey: string;
  enabled: boolean;
};

export type PlatformTenantMember = {
  userId: string;
  email: string;
  fullName: string | null;
  role: "admin" | "reception";
  status: string;
  createdAt: string;
};

export type PlatformPmsConfigView = {
  provider: string;
  enabled: boolean;
  baseUrl: string;
  tokens: {
    reservations: string;
    hub: string;
    admin: string;
    checkouts: string;
    created: string;
    api: string;
  };
  masked: {
    reservations: string;
    hub: string;
    admin: string;
    checkouts: string;
    created: string;
    api: string;
  };
  hasConfig: boolean;
};

const tenantSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido. Use letras minúsculas, números e hífens.");

const tenantPublicNumberSchema = z.coerce.number().int().positive();

async function resolveTenantUuidByPublicNumber(publicNumber: number): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("public_number", publicNumber)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Empresa não encontrada.");
  return data.id;
}

export const platformMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { data: isPlatformAdmin, error: platformError },
      { data: profile, error: profileError },
      { data: tenant, error: tenantError },
    ] = await Promise.all([
      supabaseAdmin.rpc("is_platform_admin", { _user_id: userId }),
      supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle(),
      supabaseAdmin
        .from("tenants")
        .select("id, name, slug")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (platformError) throw new Error(platformError.message);
    if (profileError) throw new Error(profileError.message);
    if (tenantError) throw new Error(tenantError.message);

    return {
      isPlatformAdmin: Boolean(isPlatformAdmin),
      email: profile?.email ?? "",
      fullName: profile?.full_name ?? null,
      sampleTenantName: tenant?.name ?? null,
    };
  });

export const platformDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      { count: tenantTotal },
      { count: tenantActive },
      { count: memberTotal },
      { count: establishmentTotal },
      { count: checkinTotal },
      { data: integrations },
    ] = await Promise.all([
      supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin
        .from("tenant_memberships")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabaseAdmin.from("establishments").select("establishment_id", { count: "exact", head: true }),
      supabaseAdmin.from("checkin_records").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("platform_integrations").select("id, name, integration_type, enabled"),
    ]);

    return {
      tenants: {
        total: tenantTotal ?? 0,
        active: tenantActive ?? 0,
        inactive: (tenantTotal ?? 0) - (tenantActive ?? 0),
      },
      members: memberTotal ?? 0,
      establishments: establishmentTotal ?? 0,
      checkins: checkinTotal ?? 0,
      integrations: integrations ?? [],
    };
  });

export const platformListTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async (): Promise<{ tenants: PlatformTenantSummary[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("tenants")
      .select("id, public_number, name, slug, status, legal_name, tax_id, created_at, updated_at")
      .order("public_number", { ascending: true });

    if (error) throw new Error(error.message);

    const tenants = await Promise.all(
      (rows ?? []).map(async (row) => {
        const [{ count: memberCount }, { count: establishmentCount }] = await Promise.all([
          supabaseAdmin
            .from("tenant_memberships")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", row.id)
            .eq("status", "active"),
          supabaseAdmin
            .from("establishments")
            .select("establishment_id", { count: "exact", head: true })
            .eq("tenant_id", row.id),
        ]);

        return {
          publicNumber: Number(row.public_number),
          name: row.name,
          slug: row.slug,
          status: row.status as PlatformTenantStatus,
          legalName: row.legal_name,
          taxId: row.tax_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          memberCount: memberCount ?? 0,
          establishmentCount: establishmentCount ?? 0,
        };
      }),
    );

    return { tenants };
  });

export const platformCreateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(200),
        slug: tenantSlugSchema,
        legalName: z.string().trim().max(200).optional(),
        taxId: z.string().trim().max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.name,
        slug: data.slug,
        legal_name: data.legalName ?? null,
        tax_id: data.taxId ?? null,
        status: "active",
      })
      .select("id, public_number")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma empresa com este slug.");
      throw new Error(error.message);
    }

    await supabaseAdmin.from("tenant_features").upsert(
      [
        { tenant_id: row.id, feature_key: "pms_vivakey", enabled: false },
        { tenant_id: row.id, feature_key: "portaria_inbox", enabled: false },
        {
          tenant_id: row.id,
          feature_key: "zepiris_photo_validation",
          enabled: false,
          config: {
            blurCheck: true,
            spoofCheck: true,
            nsfwCheck: false,
            faceDetection: true,
            maxAttempts: 5,
            timeoutMs: 10000,
            unavailablePolicy: "BLOCK",
          },
        },
      ],
      { onConflict: "tenant_id,feature_key" },
    );

    await writeAuditLog({
      userId: context.userId,
      tenantId: row.id,
      action: "platform.tenant.create",
      entityType: "tenants",
      entityId: row.id,
      newData: data,
    });

    return { ok: true as const, publicNumber: Number(row.public_number) };
  });

export const platformGetTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z.object({ publicNumber: tenantPublicNumberSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);

    const { data: tenant, error } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", tenantUuid)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!tenant) throw new Error("Empresa não encontrada.");

    const [{ data: features }, { data: pmsRow }, { data: pmsVbRow }] = await Promise.all([
      supabaseAdmin
        .from("tenant_features")
        .select("feature_key, enabled, config")
        .eq("tenant_id", tenantUuid),
      supabaseAdmin
        .from("tenant_pms_configs")
        .select("provider, enabled, config")
        .eq("tenant_id", tenantUuid)
        .eq("provider", "vivakey")
        .maybeSingle(),
      supabaseAdmin
        .from("tenant_pms_configs")
        .select("provider, enabled, config")
        .eq("tenant_id", tenantUuid)
        .eq("provider", "vb")
        .maybeSingle(),
    ]);

    const pmsConfig = normalizeTenantPmsConfig(pmsRow?.config);
    const pmsVbConfig = normalizeTenantPmsConfig(pmsVbRow?.config);
    const tokens = pmsConfig.tokens ?? {};
    const { parseTenantSettings } = await import("@/lib/tenant-settings");
    const { loadTenantInboxContext } = await import("@/lib/inbox/tenant.server");
    const { loadTenantZepirisContext } = await import("@/lib/face-validation/service.server");
    const { checkZepirisMlHealth } = await import("@/lib/face-validation/zepiris-http.server");
    const { readZepirisRuntimeConfig, isZepirisApiTenantConfigured } = await import(
      "@/lib/face-validation/config"
    );
    const branding = parseTenantSettings(tenant.settings);
    const inbox = await loadTenantInboxContext(tenantUuid);
    const { loadTenantWhatsAppChatContext } = await import("@/lib/whatsapp-chat/tenant.server");
    const whatsapp = await loadTenantWhatsAppChatContext(tenantUuid);
    const zepiris = await loadTenantZepirisContext(tenantUuid);
    const runtime = readZepirisRuntimeConfig();
    const zepirisOperational =
      runtime.globallyEnabled &&
      runtime.apiKeyConfigured &&
      isZepirisApiTenantConfigured(zepiris.config, runtime) &&
      (await checkZepirisMlHealth(runtime.mlUrl, 5000, runtime.apiKey));

    return {
      tenant: {
        publicNumber: Number(tenant.public_number),
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status as PlatformTenantStatus,
        legalName: tenant.legal_name,
        taxId: tenant.tax_id,
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at,
        panelLogoUrl: branding.panelLogoUrl,
      },
      features: (features ?? []).map((row) => ({
        featureKey: row.feature_key,
        enabled: row.enabled === true,
      })),
      pms: {
        provider: "vivakey",
        enabled: pmsRow?.enabled !== false,
        baseUrl: pmsConfig.baseUrl ?? "",
        tokens: {
          reservations: tokens.reservations ?? "",
          hub: tokens.hub ?? "",
          admin: tokens.admin ?? "",
          checkouts: tokens.checkouts ?? "",
          created: tokens.created ?? "",
          api: tokens.api ?? "",
        },
        masked: {
          reservations: maskToken(tokens.reservations),
          hub: maskToken(tokens.hub),
          admin: maskToken(tokens.admin),
          checkouts: maskToken(tokens.checkouts),
          created: maskToken(tokens.created),
          api: maskToken(tokens.api),
        },
        hasConfig: Boolean(pmsRow),
      } satisfies PlatformPmsConfigView,
      pmsVb: {
        provider: "vb",
        enabled: pmsVbRow?.enabled !== false,
        baseUrl: pmsVbConfig.baseUrl ?? "",
        tokens: {
          api: pmsVbConfig.tokens?.api ?? "",
        },
        masked: {
          api: maskToken(pmsVbConfig.tokens?.api),
        },
        hasConfig: Boolean(pmsVbRow),
      },
      inbox: {
        featureEnabled: inbox.featureEnabled,
        configured: inbox.configured,
        baseUrl: inbox.baseUrl,
        maskedClientId: inbox.maskedClientId,
        hasClientSecret: inbox.hasClientSecret,
        modules: inbox.modules,
      },
      whatsapp: {
        configured: whatsapp.configured,
        maskedApiToken: whatsapp.maskedApiToken,
        organizationId: whatsapp.organizationId,
        inboxId: whatsapp.inboxId,
        baseUrl: whatsapp.baseUrl,
      },
      zepiris: {
        featureEnabled: zepiris.featureEnabled,
        active: zepiris.active,
        provider: zepiris.provider,
        version: zepiris.version,
        operational: zepirisOperational,
        globallyEnabled: runtime.globallyEnabled,
        apiKeyConfigured: runtime.apiKeyConfigured,
        photoguardTenantConfigured: isZepirisApiTenantConfigured(zepiris.config, runtime),
        mlUrl: runtime.mlUrl,
        config: zepiris.config,
      },
    };
  });

export const platformUpdateTenant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        name: z.string().trim().min(2).max(200),
        slug: tenantSlugSchema,
        legalName: z.string().trim().max(200).nullable().optional(),
        taxId: z.string().trim().max(32).nullable().optional(),
        status: z.enum(["active", "inactive", "suspended"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);

    const { data: existing } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", tenantUuid)
      .maybeSingle();
    if (!existing) throw new Error("Empresa não encontrada.");

    const { error } = await supabaseAdmin
      .from("tenants")
      .update({
        name: data.name,
        slug: data.slug,
        legal_name: data.legalName ?? null,
        tax_id: data.taxId ?? null,
        status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantUuid);

    if (error) {
      if (error.code === "23505") throw new Error("Já existe uma empresa com este slug.");
      throw new Error(error.message);
    }

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.update",
      entityType: "tenants",
      entityId: tenantUuid,
      oldData: existing,
      newData: data,
    });

    return { ok: true as const };
  });

export const platformUpdateTenantFeatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        features: z.array(
          z.object({
            featureKey: z.string().trim().min(1).max(64),
            enabled: z.boolean(),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);

    for (const feature of data.features) {
      const { error } = await supabaseAdmin.from("tenant_features").upsert(
        {
          tenant_id: tenantUuid,
          feature_key: feature.featureKey,
          enabled: feature.enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,feature_key" },
      );
      if (error) throw new Error(error.message);
    }

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.features",
      entityType: "tenant_features",
      entityId: tenantUuid,
      newData: data.features,
    });

    return { ok: true as const };
  });

export const platformSaveTenantPmsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        enabled: z.boolean(),
        baseUrl: z.string().trim().max(500).optional(),
        tokens: z
          .object({
            reservations: z.string().trim().max(500).optional(),
            hub: z.string().trim().max(500).optional(),
            admin: z.string().trim().max(500).optional(),
            checkouts: z.string().trim().max(500).optional(),
            created: z.string().trim().max(500).optional(),
            api: z.string().trim().max(500).optional(),
          })
          .optional(),
        mergeTokens: z.boolean().default(true),
        provider: z.enum(["vivakey", "vb"]).default("vivakey"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);
    const provider = data.provider;

    const { data: existingRow } = await supabaseAdmin
      .from("tenant_pms_configs")
      .select("config")
      .eq("tenant_id", tenantUuid)
      .eq("provider", provider)
      .maybeSingle();

    const existingConfig = normalizeTenantPmsConfig(existingRow?.config);
    const incomingTokens = (data.tokens ?? {}) as TenantPmsTokenConfig;

    let mergedTokens: TenantPmsTokenConfig = { ...incomingTokens };
    if (data.mergeTokens && existingConfig.tokens) {
      mergedTokens = { ...existingConfig.tokens };
      for (const [key, value] of Object.entries(incomingTokens)) {
        const trimmed = String(value ?? "").trim();
        if (trimmed) {
          mergedTokens[key as keyof TenantPmsTokenConfig] = trimmed;
        }
      }
    }

    const config = tenantPmsConfigForSave({
      baseUrl: data.baseUrl ?? existingConfig.baseUrl ?? "",
      tokens: mergedTokens,
    });

    const { error } = await supabaseAdmin.from("tenant_pms_configs").upsert(
      {
        tenant_id: tenantUuid,
        provider,
        enabled: data.enabled,
        config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,provider" },
    );

    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.pms",
      entityType: "tenant_pms_configs",
      entityId: tenantUuid,
      newData: { enabled: data.enabled, baseUrl: config.baseUrl ?? null, tokenKeys: Object.keys(config.tokens ?? {}) },
    });

    return { ok: true as const };
  });

export const platformSaveTenantInboxConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        inboxClientId: z.string().max(128).nullable().optional(),
        inboxClientSecret: z.string().max(512).nullable().optional(),
        clearInboxClientSecret: z.boolean().optional(),
        inboxBaseUrl: z.string().max(512).nullable().optional(),
        inboxModules: z
          .object({
            portfolio: z.boolean().optional(),
            units: z.boolean().optional(),
            stays: z.boolean().optional(),
            guests: z.boolean().optional(),
            readers: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);
    const { saveTenantInboxSettings, loadTenantInboxContext } = await import("@/lib/inbox/tenant.server");

    const feature = await loadTenantInboxContext(tenantUuid);
    if (!feature.featureEnabled) {
      throw new Error("Habilite a feature Portaria Inbox antes de configurar credenciais e módulos.");
    }

    const refreshed = await saveTenantInboxSettings(tenantUuid, {
      inboxClientId: data.inboxClientId,
      inboxClientSecret: data.inboxClientSecret,
      clearInboxClientSecret: data.clearInboxClientSecret,
      inboxBaseUrl: data.inboxBaseUrl,
      inboxModules: data.inboxModules,
    });

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.inbox",
      entityType: "tenants",
      entityId: tenantUuid,
      newData: {
        configured: refreshed.configured,
        modules: refreshed.modules,
      },
    });

    return { ok: true as const, inbox: refreshed };
  });

export const platformSaveTenantWhatsAppChatConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        whatsappChatApiToken: z.string().max(512).nullable().optional(),
        whatsappOrganizationId: z.string().max(64).nullable().optional(),
        whatsappInboxId: z.string().max(64).nullable().optional(),
        whatsappChatBaseUrl: z.string().max(512).nullable().optional(),
        clearWhatsAppChatApiToken: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);
    const { saveTenantWhatsAppChatSettings } = await import("@/lib/whatsapp-chat/tenant.server");

    const refreshed = await saveTenantWhatsAppChatSettings(tenantUuid, {
      whatsappChatApiToken: data.whatsappChatApiToken,
      whatsappOrganizationId: data.whatsappOrganizationId,
      whatsappInboxId: data.whatsappInboxId,
      whatsappChatBaseUrl: data.whatsappChatBaseUrl,
      clearWhatsAppChatApiToken: data.clearWhatsAppChatApiToken,
    });

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.whatsapp",
      entityType: "tenants",
      entityId: tenantUuid,
      newData: {
        configured: refreshed.configured,
        organizationId: refreshed.organizationId,
        inboxId: refreshed.inboxId,
      },
    });

    return { ok: true as const, whatsapp: refreshed };
  });

export const platformSaveTenantZepirisConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        blurCheck: z.boolean().optional(),
        spoofCheck: z.boolean().optional(),
        nsfwCheck: z.boolean().optional(),
        faceDetection: z.boolean().optional(),
        zepirisTenant: z.string().trim().max(128).optional(),
        maxAttempts: z.number().int().min(1).max(20).optional(),
        timeoutMs: z.number().int().min(1000).max(30000).optional(),
        unavailablePolicy: z.enum(["BLOCK", "FALLBACK"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseZepirisTenantConfig, DEFAULT_ZEPIRIS_TENANT_CONFIG } = await import(
      "@/lib/face-validation/config"
    );
    const { ZEPIRIS_FEATURE_KEY } = await import("@/lib/face-validation/service.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);

    const { data: existing } = await supabaseAdmin
      .from("tenant_features")
      .select("enabled, config")
      .eq("tenant_id", tenantUuid)
      .eq("feature_key", ZEPIRIS_FEATURE_KEY)
      .maybeSingle();

    if (!existing?.enabled) {
      throw new Error("Habilite a feature Validação inteligente de fotos antes de configurar.");
    }

    const current = parseZepirisTenantConfig(existing.config ?? DEFAULT_ZEPIRIS_TENANT_CONFIG);
    const nextConfig = {
      blurCheck: data.blurCheck ?? current.blurCheck,
      spoofCheck: data.spoofCheck ?? current.spoofCheck,
      nsfwCheck: data.nsfwCheck ?? current.nsfwCheck,
      faceDetection: data.faceDetection ?? current.faceDetection,
      zepirisTenant:
        data.zepirisTenant !== undefined
          ? data.zepirisTenant.trim() || undefined
          : current.zepirisTenant,
      maxAttempts: data.maxAttempts ?? current.maxAttempts,
      timeoutMs: data.timeoutMs ?? current.timeoutMs,
      unavailablePolicy: data.unavailablePolicy ?? current.unavailablePolicy,
    };

    const { error } = await supabaseAdmin.from("tenant_features").upsert(
      {
        tenant_id: tenantUuid,
        feature_key: ZEPIRIS_FEATURE_KEY,
        enabled: true,
        config: nextConfig,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,feature_key" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.zepiris",
      entityType: "tenant_features",
      entityId: tenantUuid,
      newData: nextConfig,
    });

    return { ok: true as const, config: nextConfig };
  });

export const platformGetZepIrisHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async () => {
    const { readZepirisRuntimeConfig } = await import("@/lib/face-validation/config");
    const { checkZepirisMlHealth } = await import("@/lib/face-validation/zepiris-http.server");
    const runtime = readZepirisRuntimeConfig();
    if (!runtime.globallyEnabled) {
      return { globallyEnabled: false, operational: false, apiKeyConfigured: false, mlUrl: runtime.mlUrl };
    }
    if (!runtime.apiKeyConfigured) {
      return { globallyEnabled: true, operational: false, apiKeyConfigured: false, photoguardTenantConfigured: false, mlUrl: runtime.mlUrl };
    }
    const { isZepirisApiTenantConfigured } = await import("@/lib/face-validation/config");
    const photoguardTenantConfigured = isZepirisApiTenantConfigured(
      (await import("@/lib/face-validation/config")).DEFAULT_ZEPIRIS_TENANT_CONFIG,
      runtime,
    );
    if (!photoguardTenantConfigured) {
      return {
        globallyEnabled: true,
        operational: false,
        apiKeyConfigured: true,
        photoguardTenantConfigured: false,
        mlUrl: runtime.mlUrl,
      };
    }
    const operational = await checkZepirisMlHealth(runtime.mlUrl, 5000, runtime.apiKey);
    return {
      globallyEnabled: true,
      operational,
      apiKeyConfigured: true,
      photoguardTenantConfigured: true,
      mlUrl: runtime.mlUrl,
    };
  });

export const platformSaveTenantLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        panelLogoUrl: z.string().max(1_200_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);
    const { parseTenantSettings, MAX_TENANT_LOGO_BYTES } = await import("@/lib/tenant-settings");
    const { saveTenantSettings } = await import("@/lib/tenant-branding.server");

    const panelLogoUrl = parseTenantSettings({ panelLogoUrl: data.panelLogoUrl }).panelLogoUrl;
    if (
      data.panelLogoUrl &&
      data.panelLogoUrl.startsWith("data:") &&
      data.panelLogoUrl.length > MAX_TENANT_LOGO_BYTES * 1.4
    ) {
      throw new Error("Imagem muito grande. Use arquivos de até 400 KB.");
    }

    const settings = await saveTenantSettings(tenantUuid, { panelLogoUrl });

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.branding.logo",
      entityType: "tenants",
      entityId: tenantUuid,
      newData: { hasLogo: Boolean(settings.panelLogoUrl) },
    });

    return { ok: true as const, settings };
  });

export const platformListTenantMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z.object({ publicNumber: tenantPublicNumberSchema }).parse(input),
  )
  .handler(async ({ data }): Promise<{ members: PlatformTenantMember[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);

    const { data: rows, error } = await supabaseAdmin
      .from("tenant_memberships")
      .select("user_id, role, status, created_at")
      .eq("tenant_id", tenantUuid)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const userIds = (rows ?? []).map((row) => row.user_id);
    if (userIds.length === 0) return { members: [] };

    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profileError) throw new Error(profileError.message);

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return {
      members: (rows ?? []).map((row) => {
        const profile = profileById.get(row.user_id);
        return {
          userId: row.user_id,
          email: profile?.email ?? "",
          fullName: profile?.full_name ?? null,
          role: row.role,
          status: row.status,
          createdAt: row.created_at,
        };
      }),
    };
  });

export const platformAddTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({
        publicNumber: tenantPublicNumberSchema,
        email: z.string().trim().email().max(255),
        role: z.enum(["admin", "reception"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);
    const email = data.email.trim().toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (!profile?.id) {
      throw new Error("Usuário não encontrado. Crie a conta no painel da empresa primeiro.");
    }

    const { error } = await supabaseAdmin.from("tenant_memberships").upsert(
      {
        tenant_id: tenantUuid,
        user_id: profile.id,
        role: data.role,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );

    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.member.add",
      entityType: "tenant_memberships",
      entityId: profile.id,
      newData: { email, role: data.role },
    });

    return { ok: true as const };
  });

export const platformRemoveTenantMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z
      .object({ publicNumber: tenantPublicNumberSchema, userId: z.string().uuid() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tenantUuid = await resolveTenantUuidByPublicNumber(data.publicNumber);

    const { error } = await supabaseAdmin
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", tenantUuid)
      .eq("user_id", data.userId);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      tenantId: tenantUuid,
      action: "platform.tenant.member.remove",
      entityType: "tenant_memberships",
      entityId: data.userId,
    });

    return { ok: true as const };
  });

export const platformListIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_integrations")
      .select("*")
      .order("integration_type", { ascending: true });

    if (error) throw new Error(error.message);
    return { integrations: data ?? [] };
  });

export type PlatformAdminSummary = {
  userId: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  createdBy: string | null;
};

export const platformListPlatformAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async (): Promise<{ admins: PlatformAdminSummary[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id, created_at, created_by")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const userIds = (rows ?? []).map((row) => row.user_id);
    if (userIds.length === 0) return { admins: [] };

    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profileError) throw new Error(profileError.message);

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

    return {
      admins: (rows ?? []).map((row) => {
        const profile = profileById.get(row.user_id);
        return {
          userId: row.user_id,
          email: profile?.email ?? "",
          fullName: profile?.full_name ?? null,
          createdAt: row.created_at,
          createdBy: row.created_by,
        };
      }),
    };
  });

export const platformAddPlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .ilike("email", email)
      .maybeSingle();

    if (!profile?.id) {
      throw new Error("Usuário não encontrado. A conta precisa existir antes de ser promovida a Super Admin.");
    }

    const { error } = await supabaseAdmin.from("platform_admins").upsert(
      {
        user_id: profile.id,
        created_by: context.userId,
      },
      { onConflict: "user_id" },
    );

    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      tenantId: null,
      action: "platform.admin.add",
      entityType: "platform_admins",
      entityId: profile.id,
      newData: { email: profile.email },
    });

    return { ok: true as const };
  });

export const platformRemovePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count, error: countError } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) <= 1) {
      throw new Error("Não é possível remover o último Super Admin da plataforma.");
    }

    const { error } = await supabaseAdmin
      .from("platform_admins")
      .delete()
      .eq("user_id", data.userId);

    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      tenantId: null,
      action: "platform.admin.remove",
      entityType: "platform_admins",
      entityId: data.userId,
    });

    return { ok: true as const };
  });

export const platformGetMinioConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async () => {
    const { readMinioOnlyConfig } = await import("@/lib/minio-test.server");
    return readMinioOnlyConfig();
  });

export const platformTestMinio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePlatformAdmin])
  .handler(async ({ context }) => {
    const { runMinioStorageTest } = await import("@/lib/minio-test.server");
    const report = await runMinioStorageTest();

    await writeAuditLog({
      userId: context.userId,
      tenantId: null,
      action: "platform.minio.test",
      entityType: "minio",
      entityId: report.testRunId,
      newData: {
        ok: report.ok,
        bucket: report.config.bucket,
        endpoint: report.config.endpoint,
        uploads: report.uploads.map((item) => ({
          kind: item.kind,
          key: item.key,
          verified: item.verified,
        })),
        error: report.error,
      },
    });

    return report;
  });
