export type PmsProviderId = "vivakey" | "vb";

export type PmsApiOptions = {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  query?: Record<string, string | undefined>;
  tenantId?: string;
  establishmentId?: string | null;
  tokenScope?: "admin" | "hub" | "reservations";
  tokenEnv?: string;
};
