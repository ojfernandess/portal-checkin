# Legacy Supabase migrations

Historical SQL from the previous Supabase-hosted schema. The live app now uses the consolidated schema in `db/migrations/001_init.sql` (Postgres + `auth_users`, no `auth.users`).

Do not apply these files to new environments. Keep them only as reference when comparing behavior or columns.
