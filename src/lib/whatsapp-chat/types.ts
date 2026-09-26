export type WhatsAppChatTemplate = {
  id: string;
  name: string;
  body: string;
  bodyVariableCount: number;
  providerTemplateId: string | null;
  templateLanguage: string | null;
};

export type WhatsAppChatConfig = {
  apiToken: string;
  organizationId: string;
  inboxId: string | null;
  baseUrl: string;
};

export type WhatsAppSendTemplateResult = {
  ok: boolean;
  status: number;
  payload?: unknown;
  error?: string;
};
