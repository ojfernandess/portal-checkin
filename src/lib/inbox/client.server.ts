import type {
  CreateHardwareDeviceInput,
  CreateInboxStayGuestInput,
  CreateInboxStayInput,
  InboxApartmentOption,
  InboxEnterprise,
  InboxHardwareDevice,
  InboxManagedUnit,
  InboxPaginated,
  InboxStay,
  InboxStayGuest,
  RequestManagedUnitInput,
} from "@/lib/inbox/types";

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

export type InboxCredentials = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
};

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

export class InboxClient {
  private cachedToken: CachedToken | null = null;

  constructor(private readonly credentials: InboxCredentials) {}

  get baseUrl(): string {
    return (this.credentials.baseUrl || DEFAULT_INBOX_BASE_URL).replace(/\/$/, "");
  }

  private async fetchToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > now + 60_000) {
      return this.cachedToken.token;
    }

    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
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

    this.cachedToken = { token: accessToken, expiresAtMs };
    return accessToken;
  }

  private async fetch<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number | undefined>;
      headers?: Record<string, string>;
      paginated?: boolean;
    } = {},
  ): Promise<T> {
    const token = await this.fetchToken();
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value != null && value !== "") url.searchParams.set(key, String(value));
      }
    }

    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

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

    if (options.paginated && payload && typeof payload === "object" && "data" in payload) {
      return payload as T;
    }

    if (payload && typeof payload === "object" && "data" in payload) {
      return (payload as { data: T }).data;
    }

    return payload as T;
  }

  listEnterprises(): Promise<InboxEnterprise[]> {
    return this.fetch<InboxEnterprise[]>("/enterprises");
  }

  listManagedUnits(query?: { status?: string; per_page?: number; page?: number }) {
    return this.fetch<InboxPaginated<InboxManagedUnit> | InboxManagedUnit[]>("/managed-units", {
      query: {
        status: query?.status,
        per_page: query?.per_page,
        page: query?.page,
      },
      paginated: true,
    });
  }

  getManagedUnit(id: number): Promise<InboxManagedUnit> {
    return this.fetch<InboxManagedUnit>(`/managed-units/${id}`);
  }

  requestManagedUnit(input: RequestManagedUnitInput): Promise<InboxManagedUnit> {
    return this.fetch<InboxManagedUnit>("/managed-units", { method: "POST", body: input });
  }

  listApartmentOptions(accessSecret: string): Promise<InboxApartmentOption[]> {
    return this.fetch<InboxApartmentOption[]>("/managed-units/apartment-options", {
      method: "POST",
      body: { access_secret: accessSecret },
    });
  }

  listStays(query?: {
    status?: string;
    from?: string;
    to?: string;
    per_page?: number;
    page?: number;
    external_id?: string;
  }) {
    return this.fetch<InboxPaginated<InboxStay> | InboxStay[]>("/stays", {
      query: {
        status: query?.status,
        from: query?.from,
        to: query?.to,
        per_page: query?.per_page,
        page: query?.page,
        external_id: query?.external_id,
      },
      paginated: true,
    });
  }

  getStay(stayId: number): Promise<InboxStay> {
    return this.fetch<InboxStay>(`/stays/${stayId}`);
  }

  createStay(input: CreateInboxStayInput): Promise<InboxStay> {
    return this.fetch<InboxStay>("/stays", { method: "POST", body: input });
  }

  createStayWithPhotoMultipart(
    input: CreateInboxStayInput,
    photo: { buffer: Buffer; mimeType?: string },
  ): Promise<InboxStay> {
    const form = new FormData();
    this.appendStayFormFields(form, input);
    const mimeType = photo.mimeType ?? "image/jpeg";
    const blob = new Blob([new Uint8Array(photo.buffer)], { type: mimeType });
    form.append("photo", blob, mimeType.includes("png") ? "guest.png" : "guest.jpg");
    return this.fetch<InboxStay>("/stays", { method: "POST", body: form });
  }

  updateStay(
    stayId: number,
    input: {
      check_in_at?: string;
      check_out_at?: string;
      status?: string;
      notes?: string;
      guest_count?: number;
    },
  ): Promise<InboxStay> {
    return this.fetch<InboxStay>(`/stays/${stayId}`, { method: "PATCH", body: input });
  }

  cancelStay(stayId: number): Promise<unknown> {
    return this.fetch<unknown>(`/stays/${stayId}/cancel`, { method: "POST" });
  }

  deleteStay(stayId: number): Promise<unknown> {
    return this.fetch<unknown>(`/stays/${stayId}`, { method: "DELETE" });
  }

  checkoutStay(stayId: number): Promise<unknown> {
    return this.fetch<unknown>(`/stays/${stayId}/checkout`, { method: "POST" });
  }

  transferStayUnit(
    stayId: number,
    input: { from_managed_unit_id: number; to_managed_unit_id: number },
  ): Promise<InboxStay> {
    return this.fetch<InboxStay>(`/stays/${stayId}/transfer-unit`, { method: "POST", body: input });
  }

  listStayGuests(stayId: number): Promise<InboxStayGuest[]> {
    return this.fetch<InboxStayGuest[]>(`/stays/${stayId}/guests`);
  }

  createStayGuest(stayId: number, input: CreateInboxStayGuestInput): Promise<InboxStayGuest> {
    return this.fetch<InboxStayGuest>(`/stays/${stayId}/guests`, { method: "POST", body: input });
  }

  uploadStayGuestPhoto(stayId: number, stayGuestId: number, photoBase64: string): Promise<unknown> {
    return this.fetch<unknown>(`/stays/${stayId}/guests/${stayGuestId}/photo`, {
      method: "POST",
      body: { photo_base64: photoBase64 },
    });
  }

  uploadStayGuestPhotoMultipart(
    stayId: number,
    stayGuestId: number,
    photo: { buffer: Buffer; mimeType?: string },
  ): Promise<unknown> {
    const form = new FormData();
    const mimeType = photo.mimeType ?? "image/jpeg";
    const blob = new Blob([new Uint8Array(photo.buffer)], { type: mimeType });
    form.append("photo", blob, mimeType.includes("png") ? "guest.png" : "guest.jpg");
    return this.fetch<unknown>(`/stays/${stayId}/guests/${stayGuestId}/photo`, {
      method: "POST",
      body: form,
    });
  }

  deleteStayGuest(stayId: number, stayGuestId: number): Promise<unknown> {
    return this.fetch<unknown>(`/stays/${stayId}/guests/${stayGuestId}`, { method: "DELETE" });
  }

  listHardwareDevices(enterpriseId: number): Promise<InboxHardwareDevice[]> {
    return this.fetch<InboxHardwareDevice[]>(`/enterprises/${enterpriseId}/hardware-devices`);
  }

  getHardwareDevice(enterpriseId: number, deviceId: number): Promise<InboxHardwareDevice> {
    return this.fetch<InboxHardwareDevice>(
      `/enterprises/${enterpriseId}/hardware-devices/${deviceId}`,
    );
  }

  createHardwareDevice(
    enterpriseId: number,
    input: CreateHardwareDeviceInput,
  ): Promise<InboxHardwareDevice> {
    return this.fetch<InboxHardwareDevice>(`/enterprises/${enterpriseId}/hardware-devices`, {
      method: "POST",
      body: input,
    });
  }

  updateHardwareDevice(
    enterpriseId: number,
    deviceId: number,
    input: Partial<CreateHardwareDeviceInput>,
  ): Promise<InboxHardwareDevice> {
    return this.fetch<InboxHardwareDevice>(
      `/enterprises/${enterpriseId}/hardware-devices/${deviceId}`,
      { method: "PATCH", body: input },
    );
  }

  deleteHardwareDevice(enterpriseId: number, deviceId: number): Promise<unknown> {
    return this.fetch<unknown>(`/enterprises/${enterpriseId}/hardware-devices/${deviceId}`, {
      method: "DELETE",
    });
  }

  syncHardwareDevice(enterpriseId: number, deviceId: number): Promise<unknown> {
    return this.fetch<unknown>(
      `/enterprises/${enterpriseId}/hardware-devices/${deviceId}/sync`,
      { method: "POST" },
    );
  }

  private appendStayFormFields(form: FormData, input: CreateInboxStayInput): void {
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
}

let globalClient: InboxClient | null = null;

export function createInboxClient(credentials: InboxCredentials): InboxClient {
  return new InboxClient(credentials);
}

export function createInboxClientFromEnv(): InboxClient | null {
  const clientId = readEnv("INBOX_CLIENT_ID");
  const clientSecret = readEnv("INBOX_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return createInboxClient({
    clientId,
    clientSecret,
    baseUrl: readEnv("INBOX_BASE_URL") || DEFAULT_INBOX_BASE_URL,
  });
}

export function getGlobalInboxClient(): InboxClient {
  if (!globalClient) {
    const client = createInboxClientFromEnv();
    if (!client) {
      throw new Error("Integração Inbox não configurada (INBOX_CLIENT_ID / INBOX_CLIENT_SECRET).");
    }
    globalClient = client;
  }
  return globalClient;
}

export function normalizeInboxList<T>(result: T[] | { data: T[] }): T[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "data" in result && Array.isArray(result.data)) {
    return result.data;
  }
  return [];
}

export function normalizeInboxPaginated<T>(
  result: T[] | { data: T[]; meta?: { current_page: number; per_page: number; total: number; last_page: number } },
): { items: T[]; meta: { current_page: number; per_page: number; total: number; last_page: number } | null } {
  if (Array.isArray(result)) {
    return {
      items: result,
      meta: {
        current_page: 1,
        per_page: result.length,
        total: result.length,
        last_page: 1,
      },
    };
  }
  if (result && typeof result === "object" && "data" in result && Array.isArray(result.data)) {
    return {
      items: result.data,
      meta: result.meta ?? null,
    };
  }
  return { items: [], meta: null };
}

// Re-export types used by legacy imports
export type {
  InboxManagedUnit,
  InboxStay,
  InboxStayGuest,
  CreateInboxStayInput,
  CreateInboxStayGuestInput,
} from "@/lib/inbox/types";
