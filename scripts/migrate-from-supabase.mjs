/**
 * Copy data from a Supabase Postgres (source) into the self-hosted schema (target).
 *
 * Prerequisites:
 *   1. Target schema already applied: DATABASE_URL=... npm run db:migrate
 *   2. SUPABASE_DATABASE_URL = direct Postgres URI from Supabase
 *      (Project Settings → Database → Connection string → URI, prefer "Session" / direct :5432)
 *   3. DATABASE_URL = target Postgres
 *
 * Usage:
 *   SUPABASE_DATABASE_URL=... DATABASE_URL=... npm run db:migrate-from-supabase
 *
 * Optional:
 *   MIGRATE_DRY_RUN=1          — count/read only, no writes
 *   MIGRATE_SKIP_RATE_LIMIT=1  — skip rate_limit_buckets
 *   MIGRATE_TRUNCATE=1         — truncate target tables before import (destructive)
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const sourceUrl = process.env.SUPABASE_DATABASE_URL?.trim();
const targetUrl = process.env.DATABASE_URL?.trim();
const dryRun = process.env.MIGRATE_DRY_RUN === "1";
const skipRateLimit = process.env.MIGRATE_SKIP_RATE_LIMIT === "1";
const truncateFirst = process.env.MIGRATE_TRUNCATE === "1";

/** Real bcrypt hash of random bytes; login fails until password is reset. */
function unusablePasswordHash() {
  return bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);
}

if (!sourceUrl) {
  console.error("Missing SUPABASE_DATABASE_URL (Supabase direct Postgres URI).");
  process.exit(1);
}
if (!targetUrl) {
  console.error("Missing DATABASE_URL (target Postgres).");
  process.exit(1);
}

/** Business tables copied as-is (public schema), in FK-safe order (after auth_users). */
function businessTables() {
  const tables = [
    "tenants",
    "platform_integrations",
    "profiles",
    "user_roles",
    "tenant_memberships",
    "platform_admins",
    "tenant_pms_configs",
    "tenant_portaria_configs",
    "tenant_features",
    "establishments",
    "establishment_terms",
    "establishment_terms_history",
    "establishment_contacts",
    "establishment_extra_fields",
    "establishment_settings",
    "staff_establishments",
    "checkin_records",
    "checkin_sessions",
    "guest_portal_photos",
    "face_validation_logs",
    "app_settings",
    "audit_logs",
  ];
  if (!skipRateLimit) tables.push("rate_limit_buckets");
  return tables;
}

const TRUNCATE_ORDER = [
  "rate_limit_buckets",
  "face_validation_logs",
  "guest_portal_photos",
  "checkin_sessions",
  "checkin_records",
  "staff_establishments",
  "establishment_settings",
  "establishment_extra_fields",
  "establishment_contacts",
  "establishment_terms_history",
  "establishment_terms",
  "establishments",
  "tenant_features",
  "tenant_portaria_configs",
  "tenant_pms_configs",
  "platform_admins",
  "tenant_memberships",
  "user_roles",
  "audit_logs",
  "app_settings",
  "profiles",
  "auth_users",
  "tenants",
  // keep platform_integrations seed rows unless truncating everything
  "platform_integrations",
];

async function tableExists(client, schema, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table],
  );
  return rows.length > 0;
}

async function getColumns(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table],
  );
  return rows.map((r) => r.column_name);
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

async function copyTable(source, target, table) {
  const existsSource = await tableExists(source, "public", table);
  if (!existsSource) {
    console.log(`  skip ${table} (missing on source)`);
    return { table, copied: 0, skipped: true };
  }
  const existsTarget = await tableExists(target, "public", table);
  if (!existsTarget) {
    console.log(`  skip ${table} (missing on target)`);
    return { table, copied: 0, skipped: true };
  }

  const sourceCols = await getColumns(source, "public", table);
  const targetCols = new Set(await getColumns(target, "public", table));
  const cols = sourceCols.filter((c) => targetCols.has(c));
  if (cols.length === 0) {
    console.log(`  skip ${table} (no overlapping columns)`);
    return { table, copied: 0, skipped: true };
  }

  const colList = cols.map(quoteIdent).join(", ");
  const { rows } = await source.query(`SELECT ${colList} FROM public.${quoteIdent(table)}`);
  console.log(`  ${table}: ${rows.length} row(s)`);

  if (dryRun || rows.length === 0) {
    return { table, copied: rows.length, skipped: dryRun };
  }

  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO public.${quoteIdent(table)} (${colList})
               VALUES (${placeholders})
               ON CONFLICT DO NOTHING`;

  let copied = 0;
  let failed = 0;
  for (const row of rows) {
    const values = cols.map((c) => row[c]);
    try {
      await target.query("SAVEPOINT row_sp");
      await target.query(sql, values);
      await target.query("RELEASE SAVEPOINT row_sp");
      copied += 1;
    } catch (error) {
      failed += 1;
      await target.query("ROLLBACK TO SAVEPOINT row_sp").catch(() => {});
      if (failed <= 5) {
        console.warn(
          `  ${table}: row insert failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
  if (failed > 0) console.warn(`  ${table}: ${copied} ok, ${failed} failed`);
  return { table, copied, skipped: false, failed };
}

async function migrateAuthUsers(source, target) {
  console.log("Migrating auth.users → auth_users …");
  const hasAuth = await tableExists(source, "auth", "users");
  if (!hasAuth) {
    console.error(
      "  FATAL: auth.users not found/accessible. Use the Postgres URI as role postgres (Database → Connection string), not the API URL.",
    );
    throw new Error("Cannot read auth.users on SUPABASE_DATABASE_URL");
  }

  let rows;
  try {
    const result = await source.query(`
    SELECT
      id,
      lower(email) AS email,
      encrypted_password,
      coalesce(
        nullif(raw_user_meta_data->>'full_name', ''),
        nullif(raw_user_meta_data->>'name', ''),
        nullif(raw_user_meta_data->>'fullName', '')
      ) AS full_name,
      created_at,
      updated_at
    FROM auth.users
    WHERE email IS NOT NULL AND email <> ''
  `);
    rows = result.rows;
  } catch (error) {
    console.error(
      "  FATAL: failed to SELECT auth.users — connection user likely lacks access to schema auth.",
      error instanceof Error ? error.message : error,
    );
    throw error;
  }

  console.log(`  source auth.users with email: ${rows.length}`);

  let copied = 0;
  let withoutPassword = 0;

  for (const row of rows) {
    let passwordHash = row.encrypted_password?.trim() || null;
    if (!passwordHash) {
      withoutPassword += 1;
      passwordHash = unusablePasswordHash();
      console.warn(`  ${row.email}: sem senha no Supabase — importado com hash inválido (precisa redefinir senha)`);
    }
    if (dryRun) {
      copied += 1;
      continue;
    }
    await target.query(
      `INSERT INTO public.auth_users (id, email, password_hash, full_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         full_name = COALESCE(EXCLUDED.full_name, public.auth_users.full_name),
         updated_at = now()`,
      [row.id, row.email, passwordHash, row.full_name, row.created_at, row.updated_at],
    );
    copied += 1;
  }

  console.log(
    `  auth_users: ${copied} imported${dryRun ? " (dry-run)" : ""}, ${withoutPassword} without usable password`,
  );
  return { copied, withoutPassword };
}

async function syncTenantSequence(target) {
  if (dryRun) return;
  await target.query(`
    SELECT setval(
      'public.tenants_public_number_seq',
      GREATEST(COALESCE((SELECT MAX(public_number) FROM public.tenants), 1), 1),
      true
    )
  `);
  console.log("Synced tenants_public_number_seq");
}

async function main() {
  if (!/^postgres(ql)?:\/\//i.test(sourceUrl)) {
    console.error(
      "SUPABASE_DATABASE_URL must be postgresql://... (Database connection string), not https://xxx.supabase.co",
    );
    process.exit(1);
  }

  const source = new pg.Client({ connectionString: sourceUrl, ssl: { rejectUnauthorized: false } });
  const target = new pg.Client({ connectionString: targetUrl });

  await source.connect();
  await target.connect();

  try {
    console.log(dryRun ? "DRY RUN — no writes on target" : "Starting Supabase → Postgres migration");
    const srcProfiles = await source.query(
      `SELECT COUNT(*)::int AS n FROM public.profiles`,
    ).catch(() => ({ rows: [{ n: -1 }] }));
    console.log(`Source public.profiles count: ${srcProfiles.rows[0]?.n}`);

    if (truncateFirst && !dryRun) {
      console.log("Truncating target tables …");
      await target.query("BEGIN");
      try {
        for (const table of TRUNCATE_ORDER) {
          if (await tableExists(target, "public", table)) {
            await target.query(`TRUNCATE TABLE public.${quoteIdent(table)} CASCADE`);
            console.log(`  truncated ${table}`);
          }
        }
        await target.query("COMMIT");
      } catch (error) {
        await target.query("ROLLBACK");
        throw error;
      }
    }

    await migrateAuthUsers(source, target);

    if (!dryRun) await target.query("BEGIN");
    try {
      for (const table of businessTables()) {
        await copyTable(source, target, table);
      }
      if (!dryRun) {
        await syncTenantSequence(target);
        await target.query("COMMIT");
      }
    } catch (error) {
      if (!dryRun) await target.query("ROLLBACK");
      throw error;
    }

    console.log("Done.");
    console.log("Next: log in with an existing staff email/password (hashes reused from Supabase Auth).");
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
