import { appAuth } from "@/lib/auth-client";

/**
 * Client auth shim replacing Supabase browser client.
 * Only `auth` is used from the UI (session / signOut).
 */
export const supabase = {
  auth: appAuth,
};
