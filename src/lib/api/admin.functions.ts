import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import {
  cloneDefaultSections,
  normalizeSectionsForSave,
  parseTermsContent,
  type TermsSection,
} from "@/lib/establishment-terms";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantContext, type TenantContext } from "@/integrations/supabase/tenant-middleware";
import { assertEstablishmentInTenant, assertCheckinRecordInTenant, feedRowEstablishmentId, loadTenantEstablishmentIds, rowBelongsToTenantEstablishments } from "@/lib/tenant.server";
import { resolveReservationEstablishmentId } from "@/lib/establishment-registry.server";
import { DEFAULT_TENANT_ID } from "@/lib/tenant.constants";
import { normalizeReservationPayload } from "./reservation-normalizer";
import type { Reservation } from "./types";
import type { TecHospitalityTokenScope } from "./techospitality.server";
import { mapCheckinRecordRow, dedupeCheckinRecordsForDisplay, type CheckinRecordRow } from "@/lib/checkin-records";
import { buildIlikeContains } from "@/lib/security";
import { normalizeInboxPaginated } from "@/lib/inbox/client.server";
import { normalizeManagedUnitOptions } from "@/lib/inbox/normalize";
import { loadTenantInboxContext, resolveInboxClientForTenant } from "@/lib/inbox/tenant.server";

export type { CheckinRecordRow };

async function filterReservationsForTenant(
  reservations: Reservation[],
  tenantId: string,
): Promise<Reservation[]> {
  const establishmentIds = await loadTenantEstablishmentIds(tenantId);
  if (establishmentIds.size === 0) return [];

  return reservations.filter((reservation) =>
    rowBelongsToTenantEstablishments(resolveReservationEstablishmentId(reservation), establishmentIds),
  );
}

async function reservationBelongsToTenant(
  reservation: Reservation | null | undefined,
  tenantId: string,
): Promise<boolean> {
  if (!reservation) return false;
  const establishmentIds = await loadTenantEstablishmentIds(tenantId);
  return rowBelongsToTenantEstablishments(
    resolveReservationEstablishmentId(reservation),
    establishmentIds,
  );
}

function filterFeedRowsForTenant<T extends Record<string, unknown>>(
  rows: T[],
  establishmentIds: Set<string>,
): T[] {
  return rows.filter((row) => {
    const establishmentId = feedRowEstablishmentId(row);
    if (!establishmentId) return true;
    return establishmentIds.has(establishmentId);
  });
}

export type StaffRole = "admin" | "reception";

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  role: StaffRole;
};

type AdminHandlerContext = {
  supabase: {
    from: (table: string) => unknown;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
  };
  userId: string;
} & TenantContext;

function readDashboardEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed || undefined;
}

function dashboardFeedLimit(fallback = 20): number {
  const raw =
    readDashboardEnv("TECHOSPITALITY_DASHBOARD_FEED_LIMIT") ??
    readDashboardEnv("TECHOSPITALITY_CHECKOUTS_LIMIT") ??
    readDashboardEnv("TECHOSPITALITY_CREATED_LIMIT");
  const parsed = Number(raw ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 100) : fallback;
}

function checkoutsApiPath(): string {
  return readDashboardEnv("TECHOSPITALITY_CHECKOUTS_PATH") ?? "/api/reservations/checkouts";
}

function createdApiPath(): string {
  return readDashboardEnv("TECHOSPITALITY_CREATED_PATH") ?? "/api/reservations/created";
}

const CHECKOUTS_TOKEN_ENV = "TECHOSPITALITY_CHECKOUTS_TOKEN";
const CREATED_TOKEN_ENV = "TECHOSPITALITY_CREATED_TOKEN";

function formatAdminApiError(error: unknown, tokenEnv?: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("access token") ||
    lower.includes("invalid token") ||
    lower.includes("não configurada") ||
    lower.includes("not configured")
  ) {
    const hint = tokenEnv ?? "TECHOSPITALITY_RESERVATIONS_TOKEN";
    return new Error(
      `Integração TecHospitality indisponível. Verifique ${hint} no .env e .dev.vars.`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function fetchAdminDashboardApi(
  path: string,
  tokenEnv: string,
  tenantId: string,
  options: { query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const { apiFetch } = await import("./techospitality.server");

  if (readDashboardEnv(tokenEnv)) {
    try {
      return await apiFetch<unknown>(path, { ...options, tokenEnv, tenantId });
    } catch (error) {
      throw formatAdminApiError(error, tokenEnv);
    }
  }

  return fetchAdminReservationsApi(path, tenantId, options, tokenEnv);
}

async function fetchAdminReservationsApi(
  path: string,
  tenantId: string,
  options: { query?: Record<string, string | undefined> } = {},
  tokenHint?: string,
): Promise<unknown> {
  const { apiFetch, resolveApiTokenAsync } = await import("./techospitality.server");
  const scopes: TecHospitalityTokenScope[] = ["reservations", "admin"];
  let lastError: Error | null = null;

  for (const tokenScope of scopes) {
    const token = await resolveApiTokenAsync(tokenScope, { tenantId, tokenEnv: tokenHint });
    if (!token) continue;
    try {
      return await apiFetch<unknown>(path, { ...options, tokenScope, tenantId });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = lastError.message.toLowerCase();
      if (
        message.includes("access token") ||
        message.includes("invalid token") ||
        message.includes("401") ||
        message.includes("403")
      ) {
        continue;
      }
      throw lastError;
    }
  }

  try {
    return await apiFetch<unknown>(path, { ...options, tenantId });
  } catch (error) {
    if (lastError) {
      throw formatAdminApiError(lastError, tokenHint);
    }
    throw formatAdminApiError(error, tokenHint);
  }
}

function addDaysIso(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(date: string): string {
  const normalized = date.slice(0, 10);
  return `${normalized.slice(0, 7)}-01`;
}

function monthEndIso(date: string): string {
  const end = new Date(`${date.slice(0, 10)}T12:00:00`);
  end.setMonth(end.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

function normalizeFeedDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
}

function recomputeFeedTotals<T extends { price?: number }>(rows: T[]) {
  return {
    count: rows.length,
    totalPrice: rows.reduce((sum, row) => sum + Number(row.price ?? 0), 0),
    data: rows,
  };
}

function parseDashboardFeed<T extends Record<string, unknown>>(payload: unknown): {
  startDate?: string;
  endDate?: string;
  date?: string;
  count: number;
  totalPrice: number;
  data: T[];
} {
  const row = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const list = Array.isArray(row["data"])
    ? row["data"]
    : Array.isArray(unwrapPayload(payload))
      ? (unwrapPayload(payload) as unknown[])
      : [];

  return {
    startDate: row["startDate"] != null ? String(row["startDate"]) : undefined,
    endDate: row["endDate"] != null ? String(row["endDate"]) : undefined,
    date: row["date"] != null ? String(row["date"]) : undefined,
    count: Number(row["count"] ?? list.length) || list.length,
    totalPrice: Number(row["totalPrice"] ?? 0) || 0,
    data: list as T[],
  };
}

export type CheckoutFeedRow = {
  reservationId?: number | string;
  localizer?: string;
  checkinDate?: string;
  checkoutDate?: string;
  checkoutTime?: string;
  price?: number;
  reservationType?: string;
  salesChannel?: string;
  statusLabel?: string;
  establishmentName?: string;
  roomName?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  checkoutDone?: boolean;
  isCancelled?: boolean;
};

export type CreatedFeedRow = {
  reservationId?: number | string;
  localizer?: string;
  reservationDate?: string;
  checkinDate?: string;
  checkoutDate?: string;
  price?: number;
  reservationType?: string;
  salesChannel?: string;
  statusLabel?: string;
  establishmentName?: string;
  roomName?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  createdBy?: {
    employeeId?: number;
    name?: string;
    email?: string;
    source?: string;
    logMethod?: string;
  };
};

function unwrapPayload(payload: unknown): unknown {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

function normalizeReservationRows(payload: unknown): Reservation[] {
  const raw = unwrapPayload(payload);
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((item) => normalizeReservationPayload(item))
    .filter((item): item is Reservation => item != null);
}

export interface StaffMember {
  id: string;
  email: string;
  fullName: string | null;
  role: StaffRole;
  createdAt: string;
}

/** True while no staff account exists yet — enables the one-time first-admin setup screen. */
export const adminBootstrapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count, error } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return { needsBootstrap: (count ?? 0) === 0 };
});

/** Tenants the signed-in user can access in the admin panel. */
export const adminMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ tenants: TenantSummary[]; isPlatformAdmin: boolean }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isPlatformAdmin, error: platformError } = await supabase.rpc("is_platform_admin", {
      _user_id: userId,
    });
    if (platformError) throw new Error(platformError.message);

    if (isPlatformAdmin) {
      const { data: rows, error } = await supabaseAdmin
        .from("tenants")
        .select("id, name, slug")
        .eq("status", "active")
        .order("name", { ascending: true });

      if (error) throw new Error(error.message);

      return {
        isPlatformAdmin: true,
        tenants: (rows ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          role: "admin" as const,
        })),
      };
    }

    const { data: membershipRows, error } = await supabaseAdmin
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) throw new Error(error.message);

    let resolvedMemberships = membershipRows ?? [];

    const tenantIds = resolvedMemberships.map((row) => row.tenant_id);
    if (tenantIds.length === 0) {
      return { tenants: [], isPlatformAdmin: false };
    }

    const { data: tenantRows, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, name, slug, status")
      .in("id", tenantIds)
      .eq("status", "active")
      .order("name", { ascending: true });

    if (tenantError) throw new Error(tenantError.message);

    const roleByTenant = new Map(
      resolvedMemberships.map((row) => [row.tenant_id, row.role as StaffRole]),
    );

    const tenants = (tenantRows ?? []).map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      role: roleByTenant.get(tenant.id) ?? ("reception" as const),
    }));

    return { tenants, isPlatformAdmin: false };
  });

/** Current signed-in staff member: profile + role in the active tenant. */
export const adminMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    const { supabase, userId, tenantId, tenantRole, isPlatformAdmin } = context as AdminHandlerContext;
    await assertStaff(context as AdminHandlerContext);

    const [{ data: profile }, { data: tenant }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").eq("id", userId).maybeSingle(),
      supabase.from("tenants").select("id, name, slug, settings").eq("id", tenantId).maybeSingle(),
    ]);

    const { parseTenantSettings } = await import("@/lib/tenant-settings");
    const { loadTenantInboxContext } = await import("@/lib/inbox/tenant.server");
    const tenantSettings = parseTenantSettings(tenant?.settings ?? null);
    const inbox = await loadTenantInboxContext(tenantId);

    const role = (tenantRole ?? "reception") as StaffRole;

    return {
      userId,
      email: profile?.email ?? "",
      fullName: profile?.full_name ?? null,
      role,
      tenantId,
      tenantName: tenant?.name ?? "",
      tenantSlug: tenant?.slug ?? "",
      panelLogoUrl: tenantSettings.panelLogoUrl,
      isPlatformAdmin,
      inbox: {
        featureEnabled: inbox.featureEnabled,
        configured: inbox.configured,
        modules: inbox.modules,
        baseUrl: inbox.baseUrl,
      },
    };
  });

export const adminGetTenantBranding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    const { tenantId } = context as AdminHandlerContext;
    await assertAdmin(context as AdminHandlerContext);
    const { loadTenantSettings } = await import("@/lib/tenant-branding.server");
    const settings = await loadTenantSettings(tenantId);
    return { settings };
  });

export const adminSaveTenantLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        panelLogoUrl: z.string().max(1_200_000).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
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

    const settings = await saveTenantSettings(tenantId, { panelLogoUrl });

    await writeAuditLog({
      userId,
      tenantId,
      action: "tenant.branding.logo",
      entityType: "tenants",
      entityId: tenantId,
      newData: { hasLogo: Boolean(settings.panelLogoUrl) },
    });

    return { ok: true as const, settings };
  });

async function assertAdmin(context: AdminHandlerContext) {
  if (context.isPlatformAdmin) return;
  if (context.tenantRole !== "admin") {
    throw new Error("Apenas administradores podem realizar esta ação.");
  }
}

async function assertStaff(context: AdminHandlerContext) {
  if (context.isPlatformAdmin) return;
  if (!context.tenantRole) {
    throw new Error("Acesso negado: perfil de equipe não encontrado.");
  }
}

export const adminListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }): Promise<{ staff: StaffMember[] }> => {
    await assertAdmin(context as AdminHandlerContext);
    const { tenantId } = context as AdminHandlerContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: memberships, error } = await supabaseAdmin
      .from("tenant_memberships")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const userIds = (memberships ?? []).map((row) => row.user_id);
    if (userIds.length === 0) {
      return { staff: [] };
    }

    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .in("id", userIds)
      .order("created_at", { ascending: true });

    if (profileError) throw new Error(profileError.message);

    const roleByUser = new Map(
      (memberships ?? []).map((row) => [row.user_id, row.role as StaffRole]),
    );

    return {
      staff: (profiles ?? []).map((profile) => ({
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: roleByUser.get(profile.id) ?? "reception",
        createdAt: profile.created_at,
      })),
    };
  });

export const adminCreateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(12).max(72),
        fullName: z.string().trim().min(2).max(120),
        role: z.enum(["admin", "reception"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const normalizedEmail = data.email.trim().toLowerCase();
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      const { error: membershipError } = await supabaseAdmin.from("tenant_memberships").upsert(
        {
          tenant_id: tenantId,
          user_id: existingProfile.id,
          role: data.role,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,user_id" },
      );
      if (membershipError) throw new Error(membershipError.message);

      if (tenantId !== DEFAULT_TENANT_ID) {
        await supabaseAdmin
          .from("tenant_memberships")
          .delete()
          .eq("tenant_id", DEFAULT_TENANT_ID)
          .eq("user_id", existingProfile.id);
      }

      await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName })
        .eq("id", existingProfile.id);

      return { ok: true as const, invitedExisting: true as const };
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");

    await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", created.user.id);

    await supabaseAdmin.from("tenant_memberships").upsert(
      {
        tenant_id: tenantId,
        user_id: created.user.id,
        role: data.role,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );

    if (tenantId !== DEFAULT_TENANT_ID) {
      await supabaseAdmin
        .from("tenant_memberships")
        .delete()
        .eq("tenant_id", DEFAULT_TENANT_ID)
        .eq("user_id", created.user.id);
    }

    return { ok: true as const, invitedExisting: false as const };
  });

export const adminDeleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    if (data.userId === adminContext.userId) throw new Error("Você não pode remover a própria conta.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tenantId } = adminContext;

    const { error: membershipError } = await supabaseAdmin
      .from("tenant_memberships")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", data.userId);
    if (membershipError) throw new Error(membershipError.message);

    const { count, error: countError } = await supabaseAdmin
      .from("tenant_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.userId);
    if (countError) throw new Error(countError.message);

    if ((count ?? 0) === 0) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
      if (error) throw new Error(error.message);
    }

    await writeAuditLog({
      userId: adminContext.userId,
      tenantId,
      action: "staff.delete",
      entityType: "user",
      entityId: data.userId,
    });
    return { ok: true as const };
  });

async function getStaffEmail(context: { supabase: { from: (t: string) => any }; userId: string }) {
  const { data } = await context.supabase
    .from("profiles")
    .select("email")
    .eq("id", context.userId)
    .maybeSingle();
  return data?.email ?? "";
}

export type EstablishmentSummary = {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  termsVersion?: number | null;
  hasCustomTerms?: boolean;
};

async function upsertEstablishmentContact(
  supabaseAdmin: Awaited<ReturnType<(typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"]>>,
  data: {
    establishmentId: string;
    establishmentName?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    updatedBy: string;
    tenantId: string;
  },
) {
  const phone = data.phone?.trim() || null;
  const whatsapp = data.whatsapp?.trim() || null;
  if (!phone && !whatsapp) return;

  const { error } = await supabaseAdmin.from("establishment_contacts").upsert(
    {
      establishment_id: data.establishmentId,
      establishment_name: data.establishmentName ?? null,
      phone,
      whatsapp,
      updated_by: data.updatedBy,
      updated_at: new Date().toISOString(),
      tenant_id: data.tenantId,
    },
    { onConflict: "establishment_id" },
  );
  if (error) throw new Error(error.message);
}

export type ExtraField = {
  id: string;
  establishmentId: string;
  label: string;
  fieldType: "text" | "select" | "checkbox" | "date" | "phone";
  required: boolean;
  options: string[] | null;
  step: string;
  sortOrder: number;
};

export const adminListEstablishments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }): Promise<{ establishments: EstablishmentSummary[] }> => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data, error }, { data: contacts }, { data: termsRows }] = await Promise.all([
      supabaseAdmin
        .from("establishments")
        .select("establishment_id, name")
        .eq("tenant_id", tenantId)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("establishment_contacts")
        .select("establishment_id, phone, whatsapp")
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("establishment_terms")
        .select("establishment_id, version")
        .eq("tenant_id", tenantId),
    ]);
    if (error) throw new Error(error.message);

    const contactById = new Map(
      (contacts ?? []).map((row) => [row.establishment_id, row] as const),
    );
    const termsById = new Map(
      (termsRows ?? []).map((row) => [row.establishment_id, row] as const),
    );

    return {
      establishments: (data ?? []).map((row) => {
        const contact = contactById.get(row.establishment_id);
        const terms = termsById.get(row.establishment_id);
        return {
          id: row.establishment_id,
          name: row.name,
          phone: contact?.phone ?? null,
          whatsapp: contact?.whatsapp ?? null,
          termsVersion: terms?.version ?? null,
          hasCustomTerms: Boolean(terms),
        };
      }),
    };
  });

export const adminGetEstablishment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: row, error } = await supabaseAdmin
      .from("establishments")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      id: row.establishment_id,
      name: row.name,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

export const adminCreateEstablishment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        name: z.string().trim().min(2).max(200),
        notes: z.string().trim().max(500).optional(),
        phone: z.string().trim().max(30).optional(),
        whatsapp: z.string().trim().max(30).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(adminContext);

    const { error } = await supabaseAdmin.from("establishments").insert({
      establishment_id: data.establishmentId,
      name: data.name,
      notes: data.notes ?? null,
      created_by: userId,
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") throw new Error("Este establishmentId já está cadastrado.");
      throw new Error(error.message);
    }

    await upsertEstablishmentContact(supabaseAdmin, {
      establishmentId: data.establishmentId,
      establishmentName: data.name,
      phone: data.phone,
      whatsapp: data.whatsapp,
      updatedBy: userId,
      tenantId,
    });

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "establishment.create",
      entityType: "establishments",
      entityId: data.establishmentId,
      newData: data,
    });

    return { ok: true as const, id: data.establishmentId };
  });

export const adminUpdateEstablishment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        name: z.string().trim().min(2).max(200),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(adminContext);

    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: existing } = await supabaseAdmin
      .from("establishments")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!existing) throw new Error("Estabelecimento não encontrado.");

    const { error } = await supabaseAdmin
      .from("establishments")
      .update({
        name: data.name,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "establishment.update",
      entityType: "establishments",
      entityId: data.establishmentId,
      oldData: existing,
      newData: data,
    });

    return { ok: true as const };
  });

export const adminDeleteEstablishment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(adminContext);

    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: existing } = await supabaseAdmin
      .from("establishments")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("establishments")
      .delete()
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "establishment.delete",
      entityType: "establishments",
      entityId: data.establishmentId,
      oldData: existing,
    });

    return { ok: true as const };
  });

/** Busca establishmentId e nome a partir de um localizador/reserva (API TecHospitality). */
export const adminResolveEstablishmentFromLocalizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ localizer: z.string().trim().min(3).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { apiFetch, unwrap } = await import("./techospitality.server");
    const payload = await apiFetch<unknown>(
      `/api/reservations/localizer/${encodeURIComponent(data.localizer.toUpperCase())}`,
      { tenantId },
    );
    const reservation = unwrap<Reservation | Reservation[]>(payload);
    const row = Array.isArray(reservation) ? reservation[0] : reservation;
    if (!row?.establishmentId) {
      throw new Error("Reserva encontrada, mas sem establishmentId. Verifique o localizador.");
    }
    return {
      establishmentId: String(row.establishmentId),
      name: String(row.establishmentName ?? row.establishment?.city ?? "Estabelecimento"),
      localizer: data.localizer.toUpperCase(),
    };
  });

export const adminGetTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: row } = await supabaseAdmin
      .from("establishment_terms")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const parsed = parseTermsContent(row?.content);
    const sections = row ? parsed.sections : cloneDefaultSections();

    const { data: history } = await supabaseAdmin
      .from("establishment_terms_history")
      .select("id, version, created_at, edited_by")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .order("version", { ascending: false })
      .limit(10);

    return {
      establishmentId: data.establishmentId,
      sections,
      version: row?.version ?? 0,
      updatedAt: row?.updated_at ?? null,
      isDefault: !row,
      history: (history ?? []).map((entry) => ({
        id: entry.id,
        version: entry.version,
        createdAt: entry.created_at,
        editedBy: entry.edited_by,
      })),
    };
  });

const termsSectionSchema = z.object({
  id: z.enum(["termsOfUse", "privacyPolicy"]),
  title: z.string().trim().min(1).max(200),
  paragraphs: z.array(z.string().trim().min(1)).min(1),
});

async function persistEstablishmentTerms(
  supabaseAdmin: Awaited<ReturnType<(typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"]>>,
  data: {
    establishmentId: string;
    establishmentName?: string;
    sections: TermsSection[];
    userId: string;
    tenantId: string;
  },
) {
  const content = normalizeSectionsForSave(data.sections);

  const { data: existing } = await supabaseAdmin
    .from("establishment_terms")
    .select("content, version")
    .eq("establishment_id", data.establishmentId)
    .eq("tenant_id", data.tenantId)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  if (existing) {
    await supabaseAdmin.from("establishment_terms_history").insert({
      establishment_id: data.establishmentId,
      content: existing.content,
      version: existing.version,
      edited_by: data.userId,
      tenant_id: data.tenantId,
    });
  }

  const { error } = await supabaseAdmin.from("establishment_terms").upsert(
    {
      establishment_id: data.establishmentId,
      establishment_name: data.establishmentName ?? null,
      content,
      version: nextVersion,
      updated_by: data.userId,
      updated_at: new Date().toISOString(),
      tenant_id: data.tenantId,
    },
    { onConflict: "establishment_id" },
  );
  if (error) throw new Error(error.message);

  return { nextVersion, existing };
}

export const adminSaveTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        establishmentName: z.string().trim().max(200).optional(),
        sections: z.array(termsSectionSchema).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(adminContext);

    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { nextVersion, existing } = await persistEstablishmentTerms(supabaseAdmin, {
      establishmentId: data.establishmentId,
      establishmentName: data.establishmentName,
      sections: data.sections,
      userId,
      tenantId,
    });

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "terms.update",
      entityType: "establishment_terms",
      entityId: data.establishmentId,
      oldData: existing,
      newData: { sections: data.sections, version: nextVersion },
    });

    return { ok: true as const, version: nextVersion };
  });

export const adminGetTermsHistoryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        historyId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: row, error } = await supabaseAdmin
      .from("establishment_terms_history")
      .select("content, version, establishment_id, tenant_id")
      .eq("id", data.historyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.establishment_id !== data.establishmentId || row.tenant_id !== tenantId) {
      throw new Error("Versão não encontrada.");
    }

    return {
      version: row.version,
      sections: parseTermsContent(row.content).sections,
    };
  });

export const adminGetContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: row } = await supabaseAdmin
      .from("establishment_contacts")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return {
      phone: row?.phone ?? "",
      whatsapp: row?.whatsapp ?? "",
      establishmentName: row?.establishment_name ?? "",
    };
  });

export const adminSaveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        establishmentName: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(30).optional(),
        whatsapp: z.string().trim().max(30).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(adminContext);

    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: existing } = await supabaseAdmin
      .from("establishment_contacts")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const phone = data.phone?.trim() || null;
    const whatsapp = data.whatsapp?.trim() || null;

    const { error } = await supabaseAdmin.from("establishment_contacts").upsert(
      {
        establishment_id: data.establishmentId,
        establishment_name: data.establishmentName ?? null,
        phone,
        whatsapp,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        tenant_id: tenantId,
      },
      { onConflict: "establishment_id" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "contact.update",
      entityType: "establishment_contacts",
      entityId: data.establishmentId,
      oldData: existing,
      newData: data,
    });

    return { ok: true as const };
  });

export const adminGetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseEstablishmentSettings } = await import("@/lib/establishment-settings");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: row } = await supabaseAdmin
      .from("establishment_settings")
      .select("settings, updated_at")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const { isTenantVbIntegrationEnabled } = await import("@/lib/pms/resolve.server");
    return {
      settings: parseEstablishmentSettings(row?.settings ?? null),
      updatedAt: row?.updated_at ?? null,
      tenantVbEnabled: await isTenantVbIntegrationEnabled(tenantId),
    };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        requireBirthDateConfirmation: z.boolean(),
        requireBirthDateConfirmationOnReaccess: z.boolean(),
        successPagePhotoUrl: z.string().max(1_200_000).nullable().optional(),
        inboxEnabled: z.boolean().optional(),
        inboxManagedUnitId: z.number().int().positive().nullable().optional(),
        inboxUnitMappings: z
          .array(
            z.object({
              match: z.string().trim().min(1).max(64),
              managedUnitId: z.number().int().positive(),
            }),
          )
          .optional(),
        usefulInfoItems: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(64),
              kind: z.enum(["wifi", "access", "amenity", "parking", "hours", "info", "custom"]),
              title: z.string().trim().min(1).max(80),
              value: z.string().trim().max(2500),
              secret: z.string().trim().max(120).nullable().optional(),
              sortOrder: z.number().int().min(0).max(100),
            }),
          )
          .optional(),
        vbEnabled: z.boolean().optional(),
        vbEstablishmentId: z
          .union([
            z
              .string()
              .trim()
              .regex(/^\d*$/, "ID VB deve ser numérico")
              .max(32),
            z.null(),
          ])
          .optional(),
        vbApiToken: z.string().trim().max(500).nullable().optional(),
        vbPhotoLinkEnabled: z.boolean().optional(),
        bedPreferenceEnabled: z.boolean().optional(),
        whatsappNotifyEnabled: z.boolean().optional(),
        whatsappTemplateId: z.string().trim().max(120).nullable().optional(),
        whatsappTemplateName: z.string().trim().max(120).nullable().optional(),
        whatsappTemplateVariableCount: z.number().int().min(0).max(20).optional(),
        whatsappTemplateVariableKeys: z.array(z.string().trim().max(40)).max(20).optional(),
        whatsappSendToWa: z.boolean().optional(),
        whatsappInboxType: z.enum(["ai", "human"]).optional(),
        whatsappGovernanceNotifyEnabled: z.boolean().optional(),
        whatsappGovernanceTemplateId: z.string().trim().max(120).nullable().optional(),
        whatsappGovernanceTemplateName: z.string().trim().max(120).nullable().optional(),
        whatsappGovernanceTemplateVariableCount: z.number().int().min(0).max(20).optional(),
        whatsappGovernanceTemplateVariableKeys: z.array(z.string().trim().max(40)).max(20).optional(),
        whatsappGovernanceSendToWa: z.boolean().optional(),
        whatsappGovernanceInboxType: z.enum(["ai", "human"]).optional(),
        whatsappGovernancePhones: z.array(z.string().trim().max(32)).max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseEstablishmentSettings, MAX_SUCCESS_PAGE_PHOTO_BYTES, sanitizeUsefulInfoItems } =
      await import("@/lib/establishment-settings");
    const { sanitizeWhatsAppTemplateVariableKeys } = await import("@/lib/whatsapp-chat/notify.server");
    const email = await getStaffEmail(adminContext);

    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: existing } = await supabaseAdmin
      .from("establishment_settings")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const parsedExisting = parseEstablishmentSettings(existing?.settings ?? null);
    let successPagePhotoUrl = parsedExisting.successPagePhotoUrl;
    if (data.successPagePhotoUrl !== undefined) {
      successPagePhotoUrl = parseEstablishmentSettings({
        successPagePhotoUrl: data.successPagePhotoUrl,
      }).successPagePhotoUrl;
      if (
        data.successPagePhotoUrl &&
        data.successPagePhotoUrl.startsWith("data:") &&
        data.successPagePhotoUrl.length > MAX_SUCCESS_PAGE_PHOTO_BYTES * 1.4
      ) {
        throw new Error("A imagem excede o tamanho máximo permitido (800 KB).");
      }
    }

    const settings = {
      ...parsedExisting,
      requireBirthDateConfirmation: data.requireBirthDateConfirmation,
      requireBirthDateConfirmationOnReaccess: data.requireBirthDateConfirmationOnReaccess,
      successPagePhotoUrl,
      ...(data.inboxEnabled !== undefined ? { inboxEnabled: data.inboxEnabled } : {}),
      ...(data.inboxManagedUnitId !== undefined
        ? { inboxManagedUnitId: data.inboxManagedUnitId }
        : {}),
      ...(data.inboxUnitMappings !== undefined
        ? { inboxUnitMappings: data.inboxUnitMappings }
        : {}),
      ...(data.usefulInfoItems !== undefined
        ? { usefulInfoItems: sanitizeUsefulInfoItems(data.usefulInfoItems) }
        : {}),
      ...(data.vbEnabled !== undefined ? { vbEnabled: data.vbEnabled } : {}),
      ...(data.vbEstablishmentId !== undefined
        ? {
            vbEstablishmentId:
              data.vbEstablishmentId && String(data.vbEstablishmentId).trim()
                ? String(data.vbEstablishmentId).trim()
                : null,
          }
        : {}),
      ...(data.vbApiToken !== undefined
        ? {
            vbApiToken:
              data.vbApiToken && data.vbApiToken.trim() ? data.vbApiToken.trim() : null,
          }
        : {}),
      ...(data.vbPhotoLinkEnabled !== undefined
        ? { vbPhotoLinkEnabled: data.vbPhotoLinkEnabled }
        : {}),
      ...(data.bedPreferenceEnabled !== undefined
        ? { bedPreferenceEnabled: data.bedPreferenceEnabled }
        : {}),
      ...(data.whatsappNotifyEnabled !== undefined
        ? { whatsappNotifyEnabled: data.whatsappNotifyEnabled }
        : {}),
      ...(data.whatsappTemplateId !== undefined
        ? {
            whatsappTemplateId:
              data.whatsappTemplateId && data.whatsappTemplateId.trim()
                ? data.whatsappTemplateId.trim()
                : null,
          }
        : {}),
      ...(data.whatsappTemplateName !== undefined
        ? {
            whatsappTemplateName:
              data.whatsappTemplateName && data.whatsappTemplateName.trim()
                ? data.whatsappTemplateName.trim()
                : null,
          }
        : {}),
      ...(data.whatsappTemplateVariableCount !== undefined
        ? { whatsappTemplateVariableCount: data.whatsappTemplateVariableCount }
        : {}),
      ...(data.whatsappTemplateVariableKeys !== undefined
        ? {
            whatsappTemplateVariableKeys: sanitizeWhatsAppTemplateVariableKeys(
              data.whatsappTemplateVariableKeys,
            ),
          }
        : {}),
      ...(data.whatsappSendToWa !== undefined ? { whatsappSendToWa: data.whatsappSendToWa } : {}),
      ...(data.whatsappInboxType !== undefined ? { whatsappInboxType: data.whatsappInboxType } : {}),
      ...(data.whatsappGovernanceNotifyEnabled !== undefined
        ? { whatsappGovernanceNotifyEnabled: data.whatsappGovernanceNotifyEnabled }
        : {}),
      ...(data.whatsappGovernanceTemplateId !== undefined
        ? {
            whatsappGovernanceTemplateId:
              data.whatsappGovernanceTemplateId && data.whatsappGovernanceTemplateId.trim()
                ? data.whatsappGovernanceTemplateId.trim()
                : null,
          }
        : {}),
      ...(data.whatsappGovernanceTemplateName !== undefined
        ? {
            whatsappGovernanceTemplateName:
              data.whatsappGovernanceTemplateName && data.whatsappGovernanceTemplateName.trim()
                ? data.whatsappGovernanceTemplateName.trim()
                : null,
          }
        : {}),
      ...(data.whatsappGovernanceTemplateVariableCount !== undefined
        ? {
            whatsappGovernanceTemplateVariableCount:
              data.whatsappGovernanceTemplateVariableCount,
          }
        : {}),
      ...(data.whatsappGovernanceTemplateVariableKeys !== undefined
        ? {
            whatsappGovernanceTemplateVariableKeys: sanitizeWhatsAppTemplateVariableKeys(
              data.whatsappGovernanceTemplateVariableKeys,
            ),
          }
        : {}),
      ...(data.whatsappGovernanceSendToWa !== undefined
        ? { whatsappGovernanceSendToWa: data.whatsappGovernanceSendToWa }
        : {}),
      ...(data.whatsappGovernanceInboxType !== undefined
        ? { whatsappGovernanceInboxType: data.whatsappGovernanceInboxType }
        : {}),
      ...(data.whatsappGovernancePhones !== undefined
        ? {
            whatsappGovernancePhones: data.whatsappGovernancePhones
              .map((item) => String(item ?? "").replace(/\D/g, ""))
              .filter((item) => item.length >= 10 && item.length <= 15)
              .slice(0, 10),
          }
        : {}),
    };

    const { error } = await supabaseAdmin.from("establishment_settings").upsert(
      {
        establishment_id: data.establishmentId,
        settings,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        tenant_id: tenantId,
      },
      { onConflict: "establishment_id" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "settings.update",
      entityType: "establishment_settings",
      entityId: data.establishmentId,
      oldData: existing,
      newData: settings,
    });

    return { ok: true as const };
  });

export const adminGetWhatsAppChatStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { tenantId } = context as AdminHandlerContext;
    const { loadTenantWhatsAppChatContext } = await import("@/lib/whatsapp-chat/tenant.server");
    return loadTenantWhatsAppChatContext(tenantId);
  });

export const adminListWhatsAppTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { tenantId } = context as AdminHandlerContext;
    const { resolveWhatsAppChatConfigForTenant } = await import("@/lib/whatsapp-chat/tenant.server");
    const { listWhatsAppChatTemplates } = await import("@/lib/whatsapp-chat/client.server");

    const config = await resolveWhatsAppChatConfigForTenant(tenantId);
    if (!config) {
      throw new Error(
        "Integração WhatsApp não configurada. Informe token, organização e inbox no painel da plataforma ou variáveis de ambiente.",
      );
    }

    const templates = await listWhatsAppChatTemplates(config);
    return { templates };
  });

export const adminPreviewWhatsAppCheckinTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        templateBody: z.string().trim().min(1).max(5000),
        variableKeys: z.array(z.string().trim().max(40)).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { tenantId } = context as AdminHandlerContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      buildWhatsAppPreviewSampleContext,
      renderWhatsAppTemplatePreview,
      resolveWhatsAppTemplateParameter,
    } = await import("@/lib/whatsapp-chat/variables");
    const { sanitizeWhatsAppTemplateVariableKeys } = await import("@/lib/whatsapp-chat/notify.server");

    await assertEstablishmentInTenant(data.establishmentId, tenantId);

    const { data: establishment } = await supabaseAdmin
      .from("establishments")
      .select("name")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const keys = sanitizeWhatsAppTemplateVariableKeys(data.variableKeys);
    const contextPreview = buildWhatsAppPreviewSampleContext(
      establishment?.name ?? data.establishmentId,
    );

    return {
      preview: renderWhatsAppTemplatePreview(data.templateBody, keys, contextPreview),
      parameters: keys.map((key) =>
        resolveWhatsAppTemplateParameter(key, contextPreview, { forMetaSend: false }),
      ),
    };
  });

export const adminListInboxManagedUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.string().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(100).optional(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { tenantId } = context as AdminHandlerContext;
    const ctx = await loadTenantInboxContext(tenantId);
    if (!ctx.featureEnabled || !ctx.configured) {
      return { configured: false as const, units: [] as const, items: [] as const, meta: null };
    }
    if (!ctx.modules.units && !ctx.modules.stays) {
      throw new Error("Este módulo Inbox não está ativo para esta empresa.");
    }
    const client = await resolveInboxClientForTenant(tenantId);
    if (!client) {
      return { configured: false as const, units: [] as const, items: [] as const, meta: null };
    }
    const result = await client.listManagedUnits({
      status: data?.status ?? "active",
      page: data?.page,
      per_page: data?.perPage ?? 100,
    });
    const normalized = normalizeInboxPaginated(result);
    const units = normalizeManagedUnitOptions(normalized.items);
    return {
      configured: true as const,
      units,
      items: units,
      meta: normalized.meta,
    };
  });

export const adminGetAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseAppSettings } = await import("@/lib/app-settings");
    const { data: row } = await supabaseAdmin
      .from("app_settings")
      .select("settings, updated_at")
      .eq("id", "global")
      .maybeSingle();
    return {
      settings: parseAppSettings(row?.settings ?? null),
      updatedAt: row?.updated_at ?? null,
    };
  });

export const adminSaveAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        requireRegisteredEstablishment: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseAppSettings } = await import("@/lib/app-settings");
    const email = await getStaffEmail(adminContext);

    const { data: existing } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("id", "global")
      .maybeSingle();

    const settings = {
      ...parseAppSettings(existing?.settings ?? null),
      requireRegisteredEstablishment: data.requireRegisteredEstablishment,
    };

    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        id: "global",
        settings,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId,
      userEmail: email,
      tenantId,
      action: "app_settings.update",
      entityType: "app_settings",
      entityId: "global",
      oldData: existing,
      newData: settings,
    });

    return { ok: true as const };
  });

export const adminListExtraFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ fields: ExtraField[] }> => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const { data: rows } = await supabaseAdmin
      .from("establishment_extra_fields")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    return {
      fields: (rows ?? []).map((row) => ({
        id: row.id,
        establishmentId: row.establishment_id,
        label: row.label,
        fieldType: row.field_type as ExtraField["fieldType"],
        required: row.required,
        options: Array.isArray(row.options) ? (row.options as string[]) : null,
        step: row.step,
        sortOrder: row.sort_order,
      })),
    };
  });

export const adminSaveExtraField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        establishmentId: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(120),
        fieldType: z.enum(["text", "select", "checkbox", "date", "phone"]),
        required: z.boolean(),
        options: z.array(z.string()).optional(),
        step: z.string().trim().max(40).default("form"),
        sortOrder: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    const payload = {
      establishment_id: data.establishmentId,
      label: data.label,
      field_type: data.fieldType,
      required: data.required,
      options: data.options ?? null,
      step: data.step,
      sort_order: data.sortOrder,
      tenant_id: tenantId,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("establishment_extra_fields")
        .update(payload)
        .eq("id", data.id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("establishment_extra_fields").insert(payload);
      if (error) throw new Error(error.message);
    }

    await writeAuditLog({
      userId,
      tenantId,
      action: data.id ? "extra_field.update" : "extra_field.create",
      entityType: "establishment_extra_fields",
      entityId: data.establishmentId,
      newData: data,
    });

    return { ok: true as const };
  });

export const adminDeleteExtraField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId, userId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("establishment_extra_fields")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    await writeAuditLog({
      userId,
      tenantId,
      action: "extra_field.delete",
      entityType: "establishment_extra_fields",
      entityId: data.id,
    });
    return { ok: true as const };
  });

export const adminListAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().trim().max(80).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertAdmin(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertEstablishmentInTenant(data.establishmentId, tenantId);
    let query = supabaseAdmin
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) query = query.ilike("action", buildIlikeContains(data.action));
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });

export const adminDashboardPortalStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ date: z.string().trim().max(20).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context as AdminHandlerContext);
    const { tenantId } = context as AdminHandlerContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const selectedDate = data.date || new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const { data: rows, error } = await supabaseAdmin
      .from("checkin_records")
      .select("id, localizer, guest_name, establishment_name, checked_in_at, started_at")
      .eq("tenant_id", tenantId)
      .order("checked_in_at", { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    const records = rows ?? [];
    const dayPrefix = `${selectedDate}T`;
    const nextDay = addDaysIso(selectedDate, 1);

    const todayRecords = records.filter((row) => {
      const at = String(row.checked_in_at ?? "");
      return at >= `${selectedDate}T00:00:00` && at < `${nextDay}T00:00:00`;
    });

    const weekRecords = records.filter((row) =>
      String(row.checked_in_at ?? "").slice(0, 10) >= weekAgo,
    );

    const byHour: Record<string, number> = {};
    for (const row of todayRecords) {
      const hour = new Date(String(row.checked_in_at)).getHours();
      if (Number.isNaN(hour)) continue;
      const key = String(hour).padStart(2, "0");
      byHour[key] = (byHour[key] ?? 0) + 1;
    }

    const { computeDurationSeconds, medianSeconds } = await import("@/lib/checkin-sessions.server");

    type DurationRow = {
      id: string;
      localizer: string;
      guestName: string;
      establishmentName: string | null;
      durationSeconds: number;
      checkedInAt: string;
    };

    const durationRows: DurationRow[] = [];
    for (const row of todayRecords) {
      const startedAt = row.started_at ? String(row.started_at) : null;
      const checkedInAt = String(row.checked_in_at ?? "");
      if (!startedAt) continue;
      const durationSeconds = computeDurationSeconds(startedAt, checkedInAt);
      if (durationSeconds == null) continue;
      durationRows.push({
        id: String(row.id),
        localizer: String(row.localizer),
        guestName: String(row.guest_name),
        establishmentName: row.establishment_name != null ? String(row.establishment_name) : null,
        durationSeconds,
        checkedInAt,
      });
    }

    const durations = durationRows.map((row) => row.durationSeconds);
    const averageSeconds =
      durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null;

    const sortedByDuration = [...durationRows].sort(
      (a, b) => a.durationSeconds - b.durationSeconds,
    );

    return {
      date: selectedDate,
      total: records.length,
      today: todayRecords.length,
      week: weekRecords.length,
      byHour,
      duration: {
        measured: durationRows.length,
        totalToday: todayRecords.length,
        averageSeconds,
        medianSeconds: medianSeconds(durations),
        fastest: sortedByDuration.slice(0, 5),
        slowest: [...sortedByDuration].reverse().slice(0, 5),
      },
      recent: todayRecords.slice(0, 8).map((row) => ({
        id: row.id,
        localizer: row.localizer,
        guestName: row.guest_name,
        establishmentName: row.establishment_name,
        checkedInAt: row.checked_in_at,
      })),
    };
  });

export const adminDashboardCheckouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;
    const establishmentIds = await loadTenantEstablishmentIds(tenantId);
    const today = todayIso();
    const limit = data.limit ?? dashboardFeedLimit();
    const payload = await fetchAdminDashboardApi(checkoutsApiPath(), CHECKOUTS_TOKEN_ENV, tenantId, {
      query: {
        limit: String(limit),
        date: today,
        startDate: today,
        endDate: today,
      },
    });
    const parsed = parseDashboardFeed<CheckoutFeedRow>(payload);
    const rows = filterFeedRowsForTenant(
      parsed.data.filter((row) => normalizeFeedDate(row.checkoutDate) === today),
      establishmentIds,
    );
    return {
      ...parsed,
      date: today,
      startDate: today,
      endDate: today,
      ...recomputeFeedTotals(rows),
    };
  });

export const adminDashboardCreatedReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;
    const establishmentIds = await loadTenantEstablishmentIds(tenantId);
    const today = todayIso();
    const tomorrow = addDaysIso(today, 1);
    const startDate = monthStartIso(today);
    const endDate = monthEndIso(today);
    const limit = data.limit ?? 100;
    const query: Record<string, string> = {
      limit: String(limit),
      startDate,
      endDate,
    };

    const payload = await fetchAdminDashboardApi(createdApiPath(), CREATED_TOKEN_ENV, tenantId, { query });
    const parsed = parseDashboardFeed<CreatedFeedRow>(payload);
    const rows = filterFeedRowsForTenant(
      parsed.data
        .filter((row) => {
          const checkin = normalizeFeedDate(row.checkinDate ?? row.reservationDate);
          return checkin === today || checkin === tomorrow;
        })
        .sort((a, b) => {
          const aDate = normalizeFeedDate(a.checkinDate ?? a.reservationDate) ?? "";
          const bDate = normalizeFeedDate(b.checkinDate ?? b.reservationDate) ?? "";
          return aDate.localeCompare(bDate);
        }),
      establishmentIds,
    );

    return {
      ...parsed,
      date: today,
      startDate,
      endDate,
      ...recomputeFeedTotals(rows),
    };
  });

/** @deprecated Use adminDashboardPortalStats + feed endpoints */
export const adminDashboardStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ date: z.string().trim().max(20).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;
    const payload = await fetchAdminReservationsApi(
      "/api/reservations",
      tenantId,
      { query: data.date ? { date: data.date } : {} },
    );
    const reservations = await filterReservationsForTenant(normalizeReservationRows(payload), tenantId);

    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const checkedIn = reservations.filter((r) => {
      const c = r.checkin;
      return Number(c?.checkin_mobile) === 1 || Number(c?.checkinApi) === 1;
    });

    const todayCount = reservations.filter((r) => r.checkinDate?.startsWith(today)).length;
    const weekCount = reservations.filter(
      (r) => r.checkinDate && r.checkinDate >= weekAgo,
    ).length;

    const byHour: Record<string, number> = {};
    for (const r of checkedIn) {
      const hour = r.checkin?.localizedDate
        ? new Date(String(r.checkin.localizedDate)).getHours()
        : null;
      if (hour != null) byHour[String(hour).padStart(2, "0")] = (byHour[String(hour).padStart(2, "0")] ?? 0) + 1;
    }

    return {
      total: reservations.length,
      checkedIn: checkedIn.length,
      pending: reservations.length - checkedIn.length,
      today: todayCount,
      week: weekCount,
      byHour,
      recent: reservations.slice(0, 8),
    };
  });

export const adminListReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: z.string().trim().max(40).optional(),
        date: z.string().trim().max(20).optional(),
        status: z.enum(["all", "done", "pending"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;
    if (data.localizer) {
      const payload = await fetchAdminReservationsApi(
        `/api/reservations/localizer/${encodeURIComponent(data.localizer)}`,
        tenantId,
      );
      const reservations = await filterReservationsForTenant(normalizeReservationRows(payload), tenantId);
      return { reservations };
    }

    const query: Record<string, string> = {};
    if (data.date) query["date"] = data.date;
    const payload = await fetchAdminReservationsApi("/api/reservations", tenantId, { query });
    let reservations = await filterReservationsForTenant(normalizeReservationRows(payload), tenantId);

    if (data.status === "done") {
      reservations = reservations.filter(
        (r) => Number(r.checkin?.checkin_mobile) === 1 || Number(r.checkin?.checkinApi) === 1,
      );
    } else if (data.status === "pending") {
      reservations = reservations.filter(
        (r) => Number(r.checkin?.checkin_mobile) !== 1 && Number(r.checkin?.checkinApi) !== 1,
      );
    }

    return { reservations };
  });

export const adminGetReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ localizer: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;
    const payload = await fetchAdminReservationsApi(
      `/api/reservations/localizer/${encodeURIComponent(data.localizer)}`,
      tenantId,
    );
    const reservations = normalizeReservationRows(payload);
    const reservation = reservations[0] ?? null;
    if (!(await reservationBelongsToTenant(reservation, tenantId))) {
      return { reservation: null };
    }
    return { reservation };
  });

export const adminListCheckinRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: z.string().trim().max(40).optional(),
        date: z.string().trim().max(20).optional(),
        establishmentId: z.string().trim().max(64).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ records: CheckinRecordRow[] }> => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("checkin_records")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("checked_in_at", { ascending: false })
      .limit(200);

    if (data.localizer) {
      query = query.ilike("localizer", buildIlikeContains(data.localizer.trim().toUpperCase()));
    }
    if (data.establishmentId) {
      query = query.eq("establishment_id", data.establishmentId);
    }
    if (data.date) {
      const next = new Date(`${data.date}T00:00:00`);
      next.setDate(next.getDate() + 1);
      query = query
        .gte("checked_in_at", `${data.date}T00:00:00`)
        .lt("checked_in_at", next.toISOString().slice(0, 10) + "T00:00:00");
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      records: dedupeCheckinRecordsForDisplay(
        (rows ?? []).map((row) => mapCheckinRecordRow(row as Record<string, unknown>)),
      ),
    };
  });

export const adminGetCheckinRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ record: CheckinRecordRow | null }> => {
    const adminContext = context as AdminHandlerContext;
    await assertStaff(adminContext);
    const { tenantId } = adminContext;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const row = await assertCheckinRecordInTenant(data.id, tenantId);
      const localizer = String(row.localizer).trim().toUpperCase();

      const { data: siblings, error: siblingsError } = await supabaseAdmin
        .from("checkin_records")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("localizer", localizer)
        .order("checked_in_at", { ascending: false });

      if (siblingsError) throw new Error(siblingsError.message);

      const mapped = (siblings ?? []).map((sibling) =>
        mapCheckinRecordRow(sibling as Record<string, unknown>),
      );
      const [merged] = dedupeCheckinRecordsForDisplay(mapped);

      return { record: merged ?? mapCheckinRecordRow(row) };
    } catch {
      return { record: null };
    }
  });
