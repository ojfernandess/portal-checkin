import { createAppDbClient, type AppDbClient } from "@/lib/db-query.server";

let _supabaseAdmin: AppDbClient | undefined;

/** Server DB client (Postgres). Kept export name for compatibility with existing imports. */
export const supabaseAdmin = new Proxy({} as AppDbClient, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createAppDbClient();
    return Reflect.get(_supabaseAdmin as object, prop, receiver);
  },
});
