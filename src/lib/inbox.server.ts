const DEFAULT_INBOX_BASE_URL = "https://inboxseg.com/api/v1/operator";

type InboxTokenResponse = {
  access_token: string;
  expires_at?: string;
  expires_in?: number;
};

type CachedToken = {
  token: string;
  expiresAtMs: number;
};

let cachedToken: CachedToken | null = null;

function readEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

export function isInboxConfigured(): boolean {
  return !!(readEnv("INBOX_CLIENT_ID") && readEnv("INBOX_CLIENT_SECRET"));
}

function getInboxBaseUrl(): string {
  return readEnv("INBOX_BASE_URL") || DEFAULT_INBOX_BASE_URL;
}

async function fetchInboxToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.token;
  }

  const clientId = readEnv("INBOX_CLIENT_ID");
  const clientSecret = readEnv("INBOX_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Integração Inbox não configurada (INBOX_CLIENT_ID / INBOX_CLIENT_SECRET).");
  }

  const response = await fetch(`${getInboxBaseUrl()}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: InboxTokenResponse }
    | InboxTokenResponse
    | null;

  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ??
      `Falha ao autenticar na Inbox (${response.status}).`;
    throw new Error(message);
  }

  const tokenData =
    payload && "data" in payload && payload.data
      ? payload.data
      : (payload as InboxTokenResponse | null);

  const accessToken = tokenData?.access_token?.trim();
  if (!accessToken) {
    throw new Error("Resposta de autenticação Inbox sem access_token.");
  }

  let expiresAtMs = now + 55 * 60 * 1000;
  if (tokenData?.expires_at) {
    const parsed = Date.parse(tokenData.expires_at);
    if (!Number.isNaN(parsed)) expiresAtMs = parsed;
  } else if (tokenData?.expires_in && tokenData.expires_in > 0) {
    expiresAtMs = now + tokenData.expires_in * 1000;
  }

  cachedToken = { token: accessToken, expiresAtMs };
  return accessToken;
}

export type InboxManagedUnit = {
  id: number;
  status: string;
  display_name: string;
  enterprise_id: number;
  apartment_id: number;
  enterprise?: { id: number; name: string };
  apartment?: {
    id: number;
    identifier: string;
    block?: { id: number; name: string };
  };
};

export type InboxStayGuest = {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  is_primary?: boolean;
  check_in_completed?: boolean;
  status?: string;
};

export type InboxStay = {
  id: number;
  managed_unit_id: number;
  status?: string;
  check_in_at?: string;
  check_out_at?: string;
  guest_count?: number;
  guests?: InboxStayGuest[];
};

async function inboxFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | undefined>;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const token = await fetchInboxToken();
  const url = new URL(`${getInboxBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value != null && value !== "") url.searchParams.set(key, value);
    }
  }

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body: isFormData
      ? (options.body as FormData)
      : options.body
        ? JSON.stringify(options.body)
        : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { message?: string } | null)?.message ??
      `Erro Inbox ${response.status} em ${path}`;
    throw new Error(message);
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function appendStayFormFields(form: FormData, input: CreateInboxStayInput): void {
  form.append("managed_unit_id", String(input.managed_unit_id));
  form.append("check_in_at", input.check_in_at);
  form.append("check_out_at", input.check_out_at);
  form.append("guest_name", input.guest_name);
  if (input.guest_email) form.append("guest_email", input.guest_email);
  if (input.guest_phone) form.append("guest_phone", input.guest_phone);
  if (input.external_id) form.append("external_id", input.external_id);
  if (input.external_uid) form.append("external_uid", input.external_uid);
  if (input.notes) form.append("notes", input.notes);
  if (input.guest_count != null) form.append("guest_count", String(input.guest_count));
}

export async function listInboxManagedUnits(): Promise<InboxManagedUnit[]> {
  const result = await inboxFetch<InboxManagedUnit[] | { data: InboxManagedUnit[] }>(
    "/managed-units",
    { query: { status: "active", per_page: "200" } },
  );
  if (Array.isArray(result)) return result;
  return [];
}

export type CreateInboxStayInput = {
  managed_unit_id: number;
  check_in_at: string;
  check_out_at: string;
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  external_id?: string;
  external_uid?: string;
  notes?: string;
  guest_count?: number;
  photo_base64?: string;
};

export async function createInboxStay(input: CreateInboxStayInput): Promise<InboxStay> {
  return inboxFetch<InboxStay>("/stays", { method: "POST", body: input });
}

/** Cria reserva com foto multipart — conclui check-in do hóspede principal (OpenAPI Inbox). */
export async function createInboxStayWithPhotoMultipart(
  input: CreateInboxStayInput,
  photo: { buffer: Buffer; mimeType?: string },
): Promise<InboxStay> {
  const form = new FormData();
  appendStayFormFields(form, input);
  const mimeType = photo.mimeType ?? "image/jpeg";
  const blob = new Blob([new Uint8Array(photo.buffer)], { type: mimeType });
  form.append("photo", blob, mimeType.includes("png") ? "guest.png" : "guest.jpg");
  return inboxFetch<InboxStay>("/stays", { method: "POST", body: form });
}

export async function getInboxStay(stayId: number): Promise<InboxStay> {
  return inboxFetch<InboxStay>(`/stays/${stayId}`);
}

export type CreateInboxStayGuestInput = {
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  is_primary?: boolean;
  photo_base64?: string;
};

export async function createInboxStayGuest(
  stayId: number,
  input: CreateInboxStayGuestInput,
): Promise<InboxStayGuest> {
  return inboxFetch<InboxStayGuest>(`/stays/${stayId}/guests`, { method: "POST", body: input });
}

/** Conclui check-in do hóspede (JSON photo_base64). */
export async function uploadInboxStayGuestPhoto(
  stayId: number,
  stayGuestId: number,
  photoBase64: string,
): Promise<unknown> {
  return inboxFetch<unknown>(`/stays/${stayId}/guests/${stayGuestId}/photo`, {
    method: "POST",
    body: { photo_base64: photoBase64 },
  });
}

/** Conclui check-in do hóspede (multipart photo). */
export async function uploadInboxStayGuestPhotoMultipart(
  stayId: number,
  stayGuestId: number,
  photo: { buffer: Buffer; mimeType?: string },
): Promise<unknown> {
  const form = new FormData();
  const mimeType = photo.mimeType ?? "image/jpeg";
  const blob = new Blob([new Uint8Array(photo.buffer)], { type: mimeType });
  form.append("photo", blob, mimeType.includes("png") ? "guest.png" : "guest.jpg");
  return inboxFetch<unknown>(`/stays/${stayId}/guests/${stayGuestId}/photo`, {
    method: "POST",
    body: form,
  });
}

export async function updateInboxStay(
  stayId: number,
  input: { status?: string; guest_count?: number; notes?: string },
): Promise<InboxStay> {
  return inboxFetch<InboxStay>(`/stays/${stayId}`, { method: "PATCH", body: input });
}
