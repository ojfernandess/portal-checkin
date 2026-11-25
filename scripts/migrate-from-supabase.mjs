/**
 * Copy data from a Supabase Postgres (source) into the self-hosted schema (target).
 *
 * Optional env:
 *   MIGRATE_DRY_RUN=1
 *   MIGRATE_TRUNCATE=1
 *   MIGRATE_INCLUDE_AUDIT=1     — include audit_logs (off by default; jsonb noise / not needed for admin)
 *   MIGRATE_INCLUDE_RATE_LIMIT=1 — include rate_limit_buckets (off by default)
 *   MIGRATE_SKIP_RATE_LIMIT=1    — legacy alias (same as default skip)
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const sourceUrl = process.env.SUPABASE_DATABASE_URL?.trim();
const targetUrl = process.env.DATABASE_URL?.trim();
const dryRun = process.env.MIGRATE_DRY_RUN === "1";
const truncateFirst = process.env.MIGRATE_TRUNCATE === "1";
const includeAudit = process.env.MIGRATE_INCLUDE_AUDIT === "1";
const includeRateLimit =
  process.env.MIGRATE_INCLUDE_RATE_LIMIT === "1" &&
  process.env.MIGRATE_SKIP_RATE_LIMIT !== "1";

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
  ];
  if (includeAudit) tables.push("audit_logs");
  else console.log("Skipping audit_logs (set MIGRATE_INCLUDE_AUDIT=1 to import)");
  if (includeRateLimit) tables.push("rate_limit_buckets");
  else console.log("Skipping rate_limit_buckets (set MIGRATE_INCLUDE_RATE_LIMIT=1 to import)");
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

async function getColumnMeta(client, schema, table) {
  const { rows } = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2
     ORDER BY ordinal_position`,
    [schema, table],
  );
  return rows.map((r) => ({
    name: r.column_name,
    isJson: r.data_type === "json" || r.data_type === "jsonb" || r.udt_name === "json" || r.udt_name === "jsonb",
  }));
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

/** Ensure jsonb/json params are valid JSON text for Postgres. */
function normalizeParam(value, isJson) {
  if (!isJson) return value;
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) {
    return normalizeParam(value.toString("utf8"), true);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.stringify(JSON.parse(trimmed));
    } catch {
      // Store as a JSON string scalar if it was not valid JSON text
      return JSON.stringify(value);
    }
  }
  // objects / arrays / numbers / booleans from node-pg jsonb parser
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
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

  const targetMeta = await getColumnMeta(target, "public", table);
  const targetByName = new Map(targetMeta.map((c) => [c.name, c]));
  const sourceMeta = await getColumnMeta(source, "public", table);
  const cols = sourceMeta.map((c) => c.name).filter((name) => targetByName.has(name));
  if (cols.length === 0) {
    console.log(`  skip ${table} (no overlapping columns)`);
    return { table, copied: 0, skipped: true };
  }

  const jsonFlags = cols.map((name) => Boolean(targetByName.get(name)?.isJson));
  const colList = cols.map(quoteIdent).join(", ");
  const { rows } = await source.query(`SELECT ${colList} FROM public.${quoteIdent(table)}`);
  console.log(`  ${table}: ${rows.length} row(s)`);

  if (dryRun || rows.length === 0) {
    return { table, copied: rows.length, skipped: dryRun };
  }

  const placeholders = cols
    .map((_, i) => (jsonFlags[i] ? `$${i + 1}::jsonb` : `$${i + 1}`))
    .join(", ");
  const sql = `INSERT INTO public.${quoteIdent(table)} (${colList})
               VALUES (${placeholders})
               ON CONFLICT DO NOTHING`;

  // Commit per table so later noisy tables cannot roll back users/establishments.
  await target.query("BEGIN");
  let copied = 0;
  let failed = 0;
  try {
    for (const row of rows) {
      const values = cols.map((name, i) => normalizeParam(row[name], jsonFlags[i]));
      try {
        await target.query("SAVEPOINT row_sp");
        await target.query(sql, values);
        await target.query("RELEASE SAVEPOINT row_sp");
        copied += 1;
      } catch (error) {
        failed += 1;
        await target.query("ROLLBACK TO SAVEPOINT row_sp").catch(() => {});
        if (failed <= 3) {
          console.warn(
            `  ${table}: row insert failed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK").catch(() => {});
    throw error;
  }

  if (failed > 0) console.warn(`  ${table}: ${copied} ok, ${failed} failed`);
  else console.log(`  ${table}: ${copied} inserted`);
  return { table, copied, skipped: false, failed };
}

async function migrateAuthUsers(source, target) {
  console.log("Migrating auth.users → auth_users …");
  const hasAuth = await tableExists(source, "auth", "users");
  if (!hasAuth) {
    console.error(
      "  FATAL: auth.users not found/accessible. Use the Postgres URI as role postgres (Database → Connection string).",
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
      "  FATAL: failed to SELECT auth.users:",
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
      console.warn(`  ${row.email}: sem senha no Supabase — hash placeholder`);
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
    const srcProfiles = await source
      .query(`SELECT COUNT(*)::int AS n FROM public.profiles`)
      .catch(() => ({ rows: [{ n: -1 }] }));
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

    for (const table of businessTables()) {
      await copyTable(source, target, table);
    }
    await syncTenantSequence(target);

    const { rows } = await target.query(`SELECT COUNT(*)::int AS n FROM public.profiles`);
    console.log(`Done. Target profiles count: ${rows[0]?.n ?? 0}`);
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
