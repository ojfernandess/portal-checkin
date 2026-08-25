import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantContext, type TenantContext } from "@/integrations/supabase/tenant-middleware";
import { INBOX_MODULE_KEYS, type InboxModuleKey } from "@/lib/inbox/modules";
import {
  assertInboxModuleAccess,
  loadTenantInboxContext,
  resolveInboxClientForTenant,
} from "@/lib/inbox/tenant.server";
import { normalizeInboxList, normalizeInboxPaginated } from "@/lib/inbox/client.server";
import type { InboxStaySyncStatus } from "@/lib/inbox/types";

type AdminContext = TenantContext & { userId: string; isPlatformAdmin?: boolean; tenantRole?: string | null };

async function assertAdmin(context: AdminContext): Promise<void> {
  if (context.isPlatformAdmin) return;
  if (context.tenantRole !== "admin") {
    throw new Error("Apenas administradores podem realizar esta ação.");
  }
}

export const adminGetInboxContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    await assertAdmin(context as AdminContext);
    const { tenantId } = context as AdminContext;
    return loadTenantInboxContext(tenantId);
  });

export const adminListInboxEnterprises = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .handler(async ({ context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "portfolio");
    const enterprises = await client.listEnterprises();
    return { enterprises };
  });

export const adminGetInboxManagedUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ unitId: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "units");
    const unit = await client.getManagedUnit(data.unitId);
    return { unit };
  });

export const adminRequestInboxManagedUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        accessSecret: z.string().min(1).max(256),
        apartmentId: z.number().int().positive(),
        displayName: z.string().max(256).optional(),
        autoApproveGuests: z.boolean().optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "units");
    const unit = await client.requestManagedUnit({
      access_secret: data.accessSecret,
      apartment_id: data.apartmentId,
      display_name: data.displayName,
      auto_approve_guests: data.autoApproveGuests,
      notes: data.notes,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.unit.request",
      entityType: "inbox_managed_unit",
      entityId: String(unit.id),
      newData: unit,
    });
    return { unit };
  });

export const adminListInboxApartmentOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ accessSecret: z.string().min(1).max(256) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "units");
    const options = await client.listApartmentOptions(data.accessSecret);
    return { options: normalizeInboxList(options) };
  });

export const adminListInboxStays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        externalId: z.string().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(100).optional(),
      })
      .optional()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    const result = await client.listStays({
      status: data?.status,
      from: data?.from,
      to: data?.to,
      external_id: data?.externalId,
      page: data?.page,
      per_page: data?.perPage ?? 25,
    });
    const normalized = normalizeInboxPaginated(result);
    return { items: normalized.items, meta: normalized.meta };
  });

export const adminGetInboxStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ stayId: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    const stay = await client.getStay(data.stayId);
    return { stay };
  });

export const adminCreateInboxStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        managedUnitId: z.number().int().positive(),
        checkInAt: z.string().min(1),
        checkOutAt: z.string().min(1),
        guestName: z.string().min(1).max(256),
        guestEmail: z.string().email().optional(),
        guestPhone: z.string().max(64).optional(),
        externalId: z.string().max(128).optional(),
        externalUid: z.string().max(128).optional(),
        notes: z.string().max(2000).optional(),
        guestCount: z.number().int().min(1).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    const stay = await client.createStay({
      managed_unit_id: data.managedUnitId,
      check_in_at: data.checkInAt,
      check_out_at: data.checkOutAt,
      guest_name: data.guestName,
      guest_email: data.guestEmail,
      guest_phone: data.guestPhone,
      external_id: data.externalId,
      external_uid: data.externalUid,
      notes: data.notes,
      guest_count: data.guestCount,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.stay.create",
      entityType: "inbox_stay",
      entityId: String(stay.id),
      newData: stay,
    });
    return { stay };
  });

export const adminUpdateInboxStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        stayId: z.number().int().positive(),
        checkInAt: z.string().optional(),
        checkOutAt: z.string().optional(),
        status: z.string().optional(),
        notes: z.string().max(2000).optional(),
        guestCount: z.number().int().min(1).max(50).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    const stay = await client.updateStay(data.stayId, {
      check_in_at: data.checkInAt,
      check_out_at: data.checkOutAt,
      status: data.status,
      notes: data.notes,
      guest_count: data.guestCount,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.stay.update",
      entityType: "inbox_stay",
      entityId: String(stay.id),
      newData: stay,
    });
    return { stay };
  });

export const adminCancelInboxStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ stayId: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    await client.cancelStay(data.stayId);
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.stay.cancel",
      entityType: "inbox_stay",
      entityId: String(data.stayId),
    });
    return { ok: true as const };
  });

export const adminCheckoutInboxStay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ stayId: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    await client.checkoutStay(data.stayId);
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.stay.checkout",
      entityType: "inbox_stay",
      entityId: String(data.stayId),
    });
    return { ok: true as const };
  });

export const adminTransferInboxStayUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        stayId: z.number().int().positive(),
        fromManagedUnitId: z.number().int().positive(),
        toManagedUnitId: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    const stay = await client.transferStayUnit(data.stayId, {
      from_managed_unit_id: data.fromManagedUnitId,
      to_managed_unit_id: data.toManagedUnitId,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.stay.transfer",
      entityType: "inbox_stay",
      entityId: String(stay.id),
      newData: stay,
    });
    return { stay };
  });

export const adminListInboxStayGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) => z.object({ stayId: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "guests");
    const guests = await client.listStayGuests(data.stayId);
    return { guests: normalizeInboxList(guests) };
  });

export const adminCreateInboxStayGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        stayId: z.number().int().positive(),
        name: z.string().min(1).max(256),
        email: z.string().email().optional(),
        phone: z.string().max(64).optional(),
        document: z.string().max(64).optional(),
        isPrimary: z.boolean().optional(),
        photoBase64: z.string().max(12_000_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "guests");
    const guest = await client.createStayGuest(data.stayId, {
      name: data.name,
      email: data.email,
      phone: data.phone,
      document: data.document,
      is_primary: data.isPrimary,
      photo_base64: data.photoBase64,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.guest.create",
      entityType: "inbox_stay_guest",
      entityId: String(guest.id),
      newData: guest,
    });
    return { guest };
  });

export const adminUploadInboxStayGuestPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        stayId: z.number().int().positive(),
        stayGuestId: z.number().int().positive(),
        photoBase64: z.string().min(1).max(12_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "guests");
    await client.uploadStayGuestPhoto(data.stayId, data.stayGuestId, data.photoBase64);
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.guest.photo",
      entityType: "inbox_stay_guest",
      entityId: String(data.stayGuestId),
      newData: { stayId: data.stayId },
    });
    return { ok: true as const };
  });

export const adminDeleteInboxStayGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        stayId: z.number().int().positive(),
        stayGuestId: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "guests");
    await client.deleteStayGuest(data.stayId, data.stayGuestId);
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.guest.delete",
      entityType: "inbox_stay_guest",
      entityId: String(data.stayGuestId),
      newData: { stayId: data.stayId },
    });
    return { ok: true as const };
  });

export const adminListInboxHardwareDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z.object({ enterpriseId: z.number().int().positive() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "readers");
    const devices = await client.listHardwareDevices(data.enterpriseId);
    return { devices: normalizeInboxList(devices) };
  });

export const adminGetInboxHardwareDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        enterpriseId: z.number().int().positive(),
        deviceId: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "readers");
    const device = await client.getHardwareDevice(data.enterpriseId, data.deviceId);
    return { device };
  });

export const adminCreateInboxHardwareDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        enterpriseId: z.number().int().positive(),
        name: z.string().min(1).max(256),
        driver: z.string().min(1).max(128),
        readerScope: z.enum(["operator_entrance", "operator_unit"]).optional(),
        endpoint: z.string().max(512).optional(),
        credentials: z.string().max(2000).optional(),
        qrRangeStart: z.number().int(),
        qrRangeEnd: z.number().int(),
        accessApartmentIds: z.array(z.number().int().positive()).optional(),
        accessAllowResidents: z.boolean().optional(),
        accessAllowVisitors: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "readers");
    const device = await client.createHardwareDevice(data.enterpriseId, {
      name: data.name,
      driver: data.driver,
      reader_scope: data.readerScope,
      endpoint: data.endpoint,
      credentials: data.credentials,
      qr_range_start: data.qrRangeStart,
      qr_range_end: data.qrRangeEnd,
      access_apartment_ids: data.accessApartmentIds,
      access_allow_residents: data.accessAllowResidents,
      access_allow_visitors: data.accessAllowVisitors,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.reader.create",
      entityType: "inbox_hardware_device",
      entityId: String(device.id),
      newData: { enterpriseId: data.enterpriseId, name: device.name },
    });
    return { device };
  });

export const adminUpdateInboxHardwareDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        enterpriseId: z.number().int().positive(),
        deviceId: z.number().int().positive(),
        name: z.string().min(1).max(256).optional(),
        driver: z.string().min(1).max(128).optional(),
        readerScope: z.enum(["operator_entrance", "operator_unit"]).optional(),
        endpoint: z.string().max(512).optional(),
        credentials: z.string().max(2000).optional(),
        qrRangeStart: z.number().int().optional(),
        qrRangeEnd: z.number().int().optional(),
        accessApartmentIds: z.array(z.number().int().positive()).optional(),
        accessAllowResidents: z.boolean().optional(),
        accessAllowVisitors: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "readers");
    const device = await client.updateHardwareDevice(data.enterpriseId, data.deviceId, {
      name: data.name,
      driver: data.driver,
      reader_scope: data.readerScope,
      endpoint: data.endpoint,
      credentials: data.credentials,
      qr_range_start: data.qrRangeStart,
      qr_range_end: data.qrRangeEnd,
      access_apartment_ids: data.accessApartmentIds,
      access_allow_residents: data.accessAllowResidents,
      access_allow_visitors: data.accessAllowVisitors,
    });
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.reader.update",
      entityType: "inbox_hardware_device",
      entityId: String(device.id),
      newData: { enterpriseId: data.enterpriseId },
    });
    return { device };
  });

export const adminDeleteInboxHardwareDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        enterpriseId: z.number().int().positive(),
        deviceId: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "readers");
    await client.deleteHardwareDevice(data.enterpriseId, data.deviceId);
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.reader.delete",
      entityType: "inbox_hardware_device",
      entityId: String(data.deviceId),
      newData: { enterpriseId: data.enterpriseId },
    });
    return { ok: true as const };
  });

export const adminSyncInboxHardwareDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        enterpriseId: z.number().int().positive(),
        deviceId: z.number().int().positive(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId, userId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "readers");
    await client.syncHardwareDevice(data.enterpriseId, data.deviceId);
    await writeAuditLog({
      userId,
      tenantId,
      action: "inbox.reader.sync",
      entityType: "inbox_hardware_device",
      entityId: String(data.deviceId),
      newData: { enterpriseId: data.enterpriseId },
    });
    return { ok: true as const };
  });

export const adminVerifyInboxStaySync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantContext])
  .inputValidator((input: unknown) =>
    z
      .object({
        localizer: z.string().min(1).max(64).optional(),
        stayId: z.number().int().positive().optional(),
      })
      .refine((value) => Boolean(value.localizer?.trim() || value.stayId), {
        message: "Informe localizer ou stayId.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { tenantId } = context as AdminContext;
    await assertAdmin(context as AdminContext);
    const { client } = await assertInboxModuleAccess(tenantId, "stays");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const localizer = data.localizer?.trim().toUpperCase() ?? null;
    let inboxStayId = data.stayId ?? null;
    let inboxStay = null as Awaited<ReturnType<typeof client.getStay>> | null;

    if (localizer) {
      const auditResult = await supabaseAdmin
        .from("audit_logs")
        .select("action, created_at, new_data")
        .eq("tenant_id", tenantId)
        .eq("entity_id", localizer)
        .in("action", ["inbox.sync.success", "inbox.sync.partial", "inbox.sync.failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const auditData = auditResult.data?.new_data as
        | { inboxStayId?: number; error?: string }
        | null
        | undefined;

      if (!inboxStayId && auditData?.inboxStayId) {
        inboxStayId = auditData.inboxStayId;
      }

      const staysResult = await client.listStays({ external_id: localizer, per_page: 5 });
      const stays = normalizeInboxPaginated(staysResult).items;
      const matched = stays.find(
        (stay) => stay.external_id?.toUpperCase() === localizer || stay.id === inboxStayId,
      );
      if (matched) {
        inboxStay = matched;
        inboxStayId = matched.id;
      } else if (inboxStayId) {
        inboxStay = await client.getStay(inboxStayId).catch(() => null);
      }

      const status: InboxStaySyncStatus = {
        localizer,
        sent: Boolean(inboxStay || auditResult.data?.action === "inbox.sync.success"),
        inboxStayId,
        lastSyncAction: auditResult.data?.action ?? null,
        lastSyncAt: auditResult.data?.created_at ?? null,
        error:
          auditResult.data?.action === "inbox.sync.failed"
            ? String(auditData?.error ?? "Falha no envio")
            : null,
        partial: auditResult.data?.action === "inbox.sync.partial",
      };

      return { status, stay: inboxStay };
    }

    if (inboxStayId) {
      inboxStay = await client.getStay(inboxStayId);
      return {
        status: {
          localizer: inboxStay.external_id?.toUpperCase() ?? String(inboxStayId),
          sent: true,
          inboxStayId,
          lastSyncAction: null,
          lastSyncAt: null,
          error: null,
          partial: false,
        } satisfies InboxStaySyncStatus,
        stay: inboxStay,
      };
    }

    throw new Error("Informe localizer ou stayId.");
  });

export const INBOX_MODULE_OPTIONS = INBOX_MODULE_KEYS;

export type { InboxModuleKey };
