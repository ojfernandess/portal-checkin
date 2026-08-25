/**
 * @deprecated Prefer `@/lib/inbox/client.server` or tenant-scoped client via `@/lib/inbox/tenant.server`.
 * Thin compatibility layer for existing imports.
 */
import {
  createInboxClientFromEnv,
  getGlobalInboxClient,
  normalizeInboxList,
  type InboxClient,
} from "@/lib/inbox/client.server";

export {
  isInboxConfigured,
  createInboxClient,
  createInboxClientFromEnv,
  getGlobalInboxClient,
  normalizeInboxList,
  normalizeInboxPaginated,
} from "@/lib/inbox/client.server";

export type {
  InboxManagedUnit,
  InboxStay,
  InboxStayGuest,
  CreateInboxStayInput,
  CreateInboxStayGuestInput,
} from "@/lib/inbox/types";

function client(): InboxClient {
  return getGlobalInboxClient();
}

export async function listInboxManagedUnits() {
  const result = await client().listManagedUnits({ status: "active", per_page: 200 });
  return normalizeInboxList(result);
}

export async function createInboxStay(
  input: import("@/lib/inbox/types").CreateInboxStayInput,
) {
  return client().createStay(input);
}

export async function createInboxStayWithPhotoMultipart(
  input: import("@/lib/inbox/types").CreateInboxStayInput,
  photo: { buffer: Buffer; mimeType?: string },
) {
  return client().createStayWithPhotoMultipart(input, photo);
}

export async function getInboxStay(stayId: number) {
  return client().getStay(stayId);
}

export async function createInboxStayGuest(
  stayId: number,
  input: import("@/lib/inbox/types").CreateInboxStayGuestInput,
) {
  return client().createStayGuest(stayId, input);
}

export async function uploadInboxStayGuestPhoto(
  stayId: number,
  stayGuestId: number,
  photoBase64: string,
) {
  return client().uploadStayGuestPhoto(stayId, stayGuestId, photoBase64);
}

export async function uploadInboxStayGuestPhotoMultipart(
  stayId: number,
  stayGuestId: number,
  photo: { buffer: Buffer; mimeType?: string },
) {
  return client().uploadStayGuestPhotoMultipart(stayId, stayGuestId, photo);
}

export async function updateInboxStay(
  stayId: number,
  input: { status?: string; guest_count?: number; notes?: string },
) {
  return client().updateStay(stayId, input);
}
