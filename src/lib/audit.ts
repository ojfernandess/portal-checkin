import { getRequest } from "@tanstack/react-start/server";
import { getClientIp } from "./rate-limit";

export type AuditEntry = {
  userId?: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldData?: unknown;
  newData?: unknown;
};

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const request = getRequest();
    const headers = request?.headers;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("audit_logs").insert({
      user_id: entry.userId ?? null,
      user_email: entry.userEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
      ip_address: headers ? getClientIp(headers) : null,
      user_agent: headers?.get("user-agent") ?? null,
    });
  } catch (error) {
    console.error("[audit]", error);
  }
}
