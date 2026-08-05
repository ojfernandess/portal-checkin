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
import { normalizeReservationPayload } from "./reservation-normalizer";
import type { Reservation } from "./types";
import type { TecHospitalityTokenScope } from "./techospitality.server";
import { mapCheckinRecordRow, type CheckinRecordRow } from "@/lib/checkin-records";
import { buildIlikeContains } from "@/lib/security";

export type { CheckinRecordRow };

export type StaffRole = "admin" | "reception";

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
  options: { query?: Record<string, string | undefined> } = {},
): Promise<unknown> {
  const { apiFetch, resolveApiToken } = await import("./techospitality.server");

  if (readDashboardEnv(tokenEnv)) {
    try {
      return await apiFetch<unknown>(path, { ...options, tokenEnv });
    } catch (error) {
      throw formatAdminApiError(error, tokenEnv);
    }
  }

  return fetchAdminReservationsApi(path, options, tokenEnv);
}

async function fetchAdminReservationsApi(
  path: string,
  options: { query?: Record<string, string | undefined> } = {},
  tokenHint?: string,
): Promise<unknown> {
  const { apiFetch, resolveApiToken } = await import("./techospitality.server");
  const scopes: TecHospitalityTokenScope[] = ["reservations", "admin"];
  let lastError: Error | null = null;

  for (const tokenScope of scopes) {
    if (!resolveApiToken(tokenScope)) continue;
    try {
      return await apiFetch<unknown>(path, { ...options, tokenScope });
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
    return await apiFetch<unknown>(path, options);
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

/** Current signed-in staff member: profile + role. */
export const adminMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(context);
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    return {
      userId,
      email: profile?.email ?? "",
      fullName: profile?.full_name ?? null,
      role: (isAdmin ? "admin" : "reception") as StaffRole,
    };
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem realizar esta ação.");
}

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Acesso negado: perfil de equipe não encontrado.");
}

export const adminListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ staff: StaffMember[] }> => {
    await assertAdmin(context);
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    const roleByUser = new Map<string, StaffRole>();
    for (const r of roles ?? []) {
      if (r.role === "admin") roleByUser.set(r.user_id, "admin");
      else if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, "reception");
    }
    return {
      staff: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        role: roleByUser.get(p.id) ?? "reception",
        createdAt: p.created_at,
      })),
    };
  });

export const adminCreateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(12).max(72),
        fullName: z.string().trim().min(2).max(120),
        role: z.enum(["admin", "reception"]),
        turnstileToken: z.string().trim().min(1).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { getClientIp } = await import("@/lib/rate-limit");
    const { assertTurnstileIfConfigured } = await import("@/lib/turnstile.server");
    const request = getRequest();
    const ip = request?.headers ? getClientIp(request.headers) : "unknown";
    await assertTurnstileIfConfigured(data.turnstileToken, ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

    if (data.role === "admin") {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", created.user.id)
        .eq("role", "reception");
    }
    return { ok: true as const };
  });

export const adminDeleteStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Você não pode remover a própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await writeAuditLog({
      userId: context.userId,
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ establishments: EstablishmentSummary[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data, error }, { data: contacts }, { data: termsRows }] = await Promise.all([
      supabaseAdmin.from("establishments").select("establishment_id, name").order("name", { ascending: true }),
      supabaseAdmin.from("establishment_contacts").select("establishment_id, phone, whatsapp"),
      supabaseAdmin.from("establishment_terms").select("establishment_id, version"),
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("establishments")
      .select("*")
      .eq("establishment_id", data.establishmentId)
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
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(context);

    const { error } = await supabaseAdmin.from("establishments").insert({
      establishment_id: data.establishmentId,
      name: data.name,
      notes: data.notes ?? null,
      created_by: context.userId,
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
      updatedBy: context.userId,
    });

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "establishment.create",
      entityType: "establishments",
      entityId: data.establishmentId,
      newData: data,
    });

    return { ok: true as const, id: data.establishmentId };
  });

export const adminUpdateEstablishment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(context);

    const { data: existing } = await supabaseAdmin
      .from("establishments")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();
    if (!existing) throw new Error("Estabelecimento não encontrado.");

    const { error } = await supabaseAdmin
      .from("establishments")
      .update({
        name: data.name,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("establishment_id", data.establishmentId);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "establishment.update",
      entityType: "establishments",
      entityId: data.establishmentId,
      oldData: existing,
      newData: data,
    });

    return { ok: true as const };
  });

export const adminDeleteEstablishment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(context);

    const { data: existing } = await supabaseAdmin
      .from("establishments")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("establishments")
      .delete()
      .eq("establishment_id", data.establishmentId);
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "establishment.delete",
      entityType: "establishments",
      entityId: data.establishmentId,
      oldData: existing,
    });

    return { ok: true as const };
  });

/** Busca establishmentId e nome a partir de um localizador/reserva (API TecHospitality). */
export const adminResolveEstablishmentFromLocalizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ localizer: z.string().trim().min(3).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { apiFetch, unwrap } = await import("./techospitality.server");
    const payload = await apiFetch<unknown>(
      `/api/reservations/localizer/${encodeURIComponent(data.localizer.toUpperCase())}`,
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("establishment_terms")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();

    const parsed = parseTermsContent(row?.content);
    const sections = row ? parsed.sections : cloneDefaultSections();

    const { data: history } = await supabaseAdmin
      .from("establishment_terms_history")
      .select("id, version, created_at, edited_by")
      .eq("establishment_id", data.establishmentId)
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
  },
) {
  const content = normalizeSectionsForSave(data.sections);

  const { data: existing } = await supabaseAdmin
    .from("establishment_terms")
    .select("content, version")
    .eq("establishment_id", data.establishmentId)
    .maybeSingle();

  const nextVersion = (existing?.version ?? 0) + 1;

  if (existing) {
    await supabaseAdmin.from("establishment_terms_history").insert({
      establishment_id: data.establishmentId,
      content: existing.content,
      version: existing.version,
      edited_by: data.userId,
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
    },
    { onConflict: "establishment_id" },
  );
  if (error) throw new Error(error.message);

  return { nextVersion, existing };
}

export const adminSaveTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(context);

    const { nextVersion, existing } = await persistEstablishmentTerms(supabaseAdmin, {
      establishmentId: data.establishmentId,
      establishmentName: data.establishmentName,
      sections: data.sections,
      userId: context.userId,
    });

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "terms.update",
      entityType: "establishment_terms",
      entityId: data.establishmentId,
      oldData: existing,
      newData: { sections: data.sections, version: nextVersion },
    });

    return { ok: true as const, version: nextVersion };
  });

export const adminGetTermsHistoryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        establishmentId: z.string().trim().min(1).max(64),
        historyId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("establishment_terms_history")
      .select("content, version, establishment_id")
      .eq("id", data.historyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.establishment_id !== data.establishmentId) {
      throw new Error("Versão não encontrada.");
    }

    return {
      version: row.version,
      sections: parseTermsContent(row.content).sections,
    };
  });

export const adminGetContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("establishment_contacts")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();
    return {
      phone: row?.phone ?? "",
      whatsapp: row?.whatsapp ?? "",
      establishmentName: row?.establishment_name ?? "",
    };
  });

export const adminSaveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await getStaffEmail(context);

    const { data: existing } = await supabaseAdmin
      .from("establishment_contacts")
      .select("*")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();

    const phone = data.phone?.trim() || null;
    const whatsapp = data.whatsapp?.trim() || null;

    const { error } = await supabaseAdmin.from("establishment_contacts").upsert(
      {
        establishment_id: data.establishmentId,
        establishment_name: data.establishmentName ?? null,
        phone,
        whatsapp,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "contact.update",
      entityType: "establishment_contacts",
      entityId: data.establishmentId,
      oldData: existing,
      newData: data,
    });

    return { ok: true as const };
  });

export const adminGetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseEstablishmentSettings } = await import("@/lib/establishment-settings");
    const { data: row } = await supabaseAdmin
      .from("establishment_settings")
      .select("settings, updated_at")
      .eq("establishment_id", data.establishmentId)
      .maybeSingle();
    return {
      settings: parseEstablishmentSettings(row?.settings ?? null),
      updatedAt: row?.updated_at ?? null,
    };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseEstablishmentSettings, MAX_SUCCESS_PAGE_PHOTO_BYTES } = await import(
      "@/lib/establishment-settings"
    );
    const email = await getStaffEmail(context);

    const { data: existing } = await supabaseAdmin
      .from("establishment_settings")
      .select("*")
      .eq("establishment_id", data.establishmentId)
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
    };

    const { error } = await supabaseAdmin.from("establishment_settings").upsert(
      {
        establishment_id: data.establishmentId,
        settings,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "establishment_id" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "settings.update",
      entityType: "establishment_settings",
      entityId: data.establishmentId,
      oldData: existing,
      newData: settings,
    });

    return { ok: true as const };
  });

export const adminListInboxManagedUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { isInboxConfigured, listInboxManagedUnits } = await import("@/lib/inbox.server");
    if (!isInboxConfigured()) {
      return { configured: false as const, units: [] as const };
    }
    const units = await listInboxManagedUnits();
    return { configured: true as const, units };
  });

export const adminGetAppSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requireRegisteredEstablishment: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseAppSettings } = await import("@/lib/app-settings");
    const email = await getStaffEmail(context);

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
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);

    await writeAuditLog({
      userId: context.userId,
      userEmail: email,
      action: "app_settings.update",
      entityType: "app_settings",
      entityId: "global",
      oldData: existing,
      newData: settings,
    });

    return { ok: true as const };
  });

export const adminListExtraFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ establishmentId: z.string().trim().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ fields: ExtraField[] }> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("establishment_extra_fields")
      .select("*")
      .eq("establishment_id", data.establishmentId)
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
  .middleware([requireSupabaseAuth])
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
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      establishment_id: data.establishmentId,
      label: data.label,
      field_type: data.fieldType,
      required: data.required,
      options: data.options ?? null,
      step: data.step,
      sort_order: data.sortOrder,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("establishment_extra_fields")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("establishment_extra_fields").insert(payload);
      if (error) throw new Error(error.message);
    }

    await writeAuditLog({
      userId: context.userId,
      action: data.id ? "extra_field.update" : "extra_field.create",
      entityType: "establishment_extra_fields",
      entityId: data.establishmentId,
      newData: data,
    });

    return { ok: true as const };
  });

export const adminDeleteExtraField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("establishment_extra_fields")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAuditLog({
      userId: context.userId,
      action: "extra_field.delete",
      entityType: "establishment_extra_fields",
      entityId: data.id,
    });
    return { ok: true as const };
  });

export const adminListAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().trim().max(80).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) query = query.ilike("action", buildIlikeContains(data.action));
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { logs: rows ?? [] };
  });

export const adminDashboardPortalStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ date: z.string().trim().max(20).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const selectedDate = data.date || new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    const { data: rows, error } = await supabaseAdmin
      .from("checkin_records")
      .select("id, localizer, guest_name, establishment_name, checked_in_at")
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

    return {
      date: selectedDate,
      total: records.length,
      today: todayRecords.length,
      week: weekRecords.length,
      byHour,
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const today = todayIso();
    const limit = data.limit ?? dashboardFeedLimit();
    const payload = await fetchAdminDashboardApi(checkoutsApiPath(), CHECKOUTS_TOKEN_ENV, {
      query: {
        limit: String(limit),
        date: today,
        startDate: today,
        endDate: today,
      },
    });
    const parsed = parseDashboardFeed<CheckoutFeedRow>(payload);
    const rows = parsed.data.filter((row) => normalizeFeedDate(row.checkoutDate) === today);
    return {
      ...parsed,
      date: today,
      startDate: today,
      endDate: today,
      ...recomputeFeedTotals(rows),
    };
  });

export const adminDashboardCreatedReservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
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

    const payload = await fetchAdminDashboardApi(createdApiPath(), CREATED_TOKEN_ENV, { query });
    const parsed = parseDashboardFeed<CreatedFeedRow>(payload);
    const rows = parsed.data
      .filter((row) => {
        const checkin = normalizeFeedDate(row.checkinDate ?? row.reservationDate);
        return checkin === today || checkin === tomorrow;
      })
      .sort((a, b) => {
        const aDate = normalizeFeedDate(a.checkinDate ?? a.reservationDate) ?? "";
        const bDate = normalizeFeedDate(b.checkinDate ?? b.reservationDate) ?? "";
        return aDate.localeCompare(bDate);
      });

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ date: z.string().trim().max(20).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const payload = await fetchAdminReservationsApi("/api/reservations", {
      query: data.date ? { date: data.date } : {},
    });
    const reservations = normalizeReservationRows(payload);

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
  .middleware([requireSupabaseAuth])
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
    await assertStaff(context);
    if (data.localizer) {
      const payload = await fetchAdminReservationsApi(
        `/api/reservations/localizer/${encodeURIComponent(data.localizer)}`,
      );
      return { reservations: normalizeReservationRows(payload) };
    }

    const query: Record<string, string> = {};
    if (data.date) query["date"] = data.date;
    const payload = await fetchAdminReservationsApi("/api/reservations", { query });
    let reservations = normalizeReservationRows(payload);

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ localizer: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const payload = await fetchAdminReservationsApi(
      `/api/reservations/localizer/${encodeURIComponent(data.localizer)}`,
    );
    const reservations = normalizeReservationRows(payload);
    return { reservation: reservations[0] ?? null };
  });

export const adminListCheckinRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("checkin_records")
      .select("*")
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
      records: (rows ?? []).map((row) => mapCheckinRecordRow(row as Record<string, unknown>)),
    };
  });

export const adminGetCheckinRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ record: CheckinRecordRow | null }> => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("checkin_records")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return { record: null };

    return { record: mapCheckinRecordRow(row as Record<string, unknown>) };
  });
