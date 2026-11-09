# Compatibility shims (ex-Supabase)

This folder keeps stable import paths used across server functions:

- `client.server.ts` → Postgres query client (`createAppDbClient` / `supabaseAdmin`)
- `client.ts` → browser auth shim (`appAuth`)
- `auth-middleware.ts` / `auth-attacher.ts` → JWT Bearer auth
- `tenant-middleware.ts` / `tenant-attacher.ts` / `platform-middleware.ts` → tenant/platform guards
- `types.ts` → row typings (legacy generated shapes)

New code should prefer `@/lib/db.server`, `@/lib/db-query.server`, and `@/lib/auth.server`.
