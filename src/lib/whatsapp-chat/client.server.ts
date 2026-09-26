import type {
  WhatsAppChatConfig,
  WhatsAppChatTemplate,
  WhatsAppInboxType,
  WhatsAppSendTemplateResult,
} from "./types";
import { sanitizeWhatsAppTemplateParameterText } from "./variables";

const DEFAULT_BASE_URL = "https://chat.agentslabs.cloud";

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed || undefined;
}

export function defaultWhatsAppChatBaseUrl(): string {
  return (readEnv("WHATSAPP_CHAT_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

export async function whatsAppChatFetch<T>(
  config: WhatsAppChatConfig,
  path: string,
  init?: RequestInit & { query?: Record<string, string | undefined> },
): Promise<T> {
  const baseUrl = (config.baseUrl || defaultWhatsAppChatBaseUrl()).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      if (value != null && value !== "") url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${config.apiToken}`,
    "Organization-Id": config.organizationId,
  };

  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const row =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const message =
      (row ? String(row.message ?? row.error ?? "") : null) ||
      `Erro ${response.status} ao consultar WhatsApp Chat API.`;
    throw new Error(message);
  }

  return parsed as T;
}

function normalizeTemplateList(payload: unknown): WhatsAppChatTemplate[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data ?? [])
      : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown }).items)
        ? ((payload as { items: unknown[] }).items ?? [])
        : [];

  return rows
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? row.name ?? "").trim();
      const name = String(row.name ?? id).trim();
      const body = String(row.body ?? "").trim();
      if (!id || !body) return null;
      const bodyVariableCount = Number(row.bodyVariableCount ?? countBodyVariables(body));
      return {
        id,
        name,
        body,
        bodyVariableCount: Number.isFinite(bodyVariableCount) ? bodyVariableCount : 0,
        providerTemplateId:
          row.providerTemplateId != null && String(row.providerTemplateId).trim()
            ? String(row.providerTemplateId).trim()
            : null,
        templateLanguage:
          row.templateLanguage != null && String(row.templateLanguage).trim()
            ? String(row.templateLanguage).trim()
            : null,
      } satisfies WhatsAppChatTemplate;
    })
    .filter((item): item is WhatsAppChatTemplate => item !== null);
}

export function countBodyVariables(body: string): number {
  const matches = body.match(/\{\{\s*\d+\s*\}\}/g);
  if (!matches) return 0;
  const indexes = matches
    .map((token) => Number(/\d+/.exec(token)?.[0] ?? 0))
    .filter((value) => value > 0);
  return indexes.length > 0 ? Math.max(...indexes) : 0;
}

export async function listWhatsAppChatTemplates(
  config: WhatsAppChatConfig,
): Promise<WhatsAppChatTemplate[]> {
  const payload = await whatsAppChatFetch<unknown>(config, "/api/v1/templates", {
    method: "GET",
    query: config.inboxId ? { inboxId: config.inboxId } : undefined,
  });
  return normalizeTemplateList(payload);
}

export async function sendWhatsAppTemplateMessage(input: {
  config: WhatsAppChatConfig;
  to: string;
  templateId: string;
  bodyParameters: string[];
  sendToWA?: boolean;
  inboxType?: WhatsAppInboxType;
}): Promise<WhatsAppSendTemplateResult> {
  const urlPath = "/api/v1/sendTemplate";
  const baseUrl = (input.config.baseUrl || defaultWhatsAppChatBaseUrl()).replace(/\/$/, "");
  const url = `${baseUrl}${urlPath}`;

  const body = {
    organizationId: input.config.organizationId,
    ...(input.config.inboxId ? { inboxId: input.config.inboxId } : {}),
    to: input.to,
    data: {
      templateId: input.templateId,
      sendToWA: input.sendToWA !== false,
      inboxType: input.inboxType === "human" ? "human" : "ai",
      components: [
        {
          type: "body",
          parameters: input.bodyParameters.map((text) => ({
            type: "text",
            text: sanitizeWhatsAppTemplateParameterText(text),
          })),
        },
      ],
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.config.apiToken}`,
        "Organization-Id": input.config.organizationId,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      const row =
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      return {
        ok: false,
        status: response.status,
        payload: parsed,
        error:
          (row ? String(row.message ?? row.error ?? "") : null) ||
          `Erro ${response.status} ao enviar template WhatsApp.`,
      };
    }

    return { ok: true, status: response.status, payload: parsed };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "Falha ao contatar WhatsApp Chat API.",
    };
  }
}
