/**
 * Container entrypoint:
 * 1) Resolve DATABASE_URL from POSTGRES_* (avoids EasyPanel URL/password drift).
 * 2) Apply schema migrations (idempotent), with retries while Postgres syncs password.
 * 3) Import from Supabase when SUPABASE_DATABASE_URL is set and:
 *      - MIGRATE_FROM_SUPABASE_ON_BOOT=1, OR
 *      - target has zero profiles (empty DB) unless MIGRATE_SKIP_IF_EMPTY=1.
 * 4) Start the Nitro server.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDatabaseUrl() {
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const user = process.env.POSTGRES_USER?.trim() || "welcome";
  const db = process.env.POSTGRES_DB?.trim() || "welcome_inn";
  const host = process.env.POSTGRES_HOST?.trim() || "postgres";
  const port = process.env.POSTGRES_PORT?.trim() || "5432";

  if (password) {
    const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(db)}`;
    process.env.DATABASE_URL = url;
    console.log(
      `[entrypoint] DATABASE_URL built from POSTGRES_* → postgresql://${user}:***@${host}:${port}/${db}`,
    );
    return url;
  }

  const existing = process.env.DATABASE_URL?.trim();
  if (!existing) {
    throw new Error(
      "Missing DATABASE_URL (or set POSTGRES_PASSWORD + POSTGRES_USER + POSTGRES_DB).",
    );
  }
  return existing;
}

function runNode(scriptRel, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, scriptRel)], {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptRel} exited with code ${code}`));
    });
  });
}

async function migrateWithRetry(attempts = 30, delayMs = 2000) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      console.log(`[entrypoint] Applying schema migrations (attempt ${i}/${attempts})…`);
      await runNode("scripts/db-migrate.mjs");
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[entrypoint] migrate failed (attempt ${i}/${attempts}): ${error instanceof Error ? error.message : error}`,
      );
      if (i < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

async function countProfiles(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const exists = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'profiles' LIMIT 1`,
    );
    if (exists.rows.length === 0) return 0;
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM public.profiles`);
    return Number(rows[0]?.n ?? 0);
  } finally {
    await client.end().catch(() => {});
  }
}

function assertPostgresUri(url) {
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      "SUPABASE_DATABASE_URL must be a Postgres URI (postgresql://...), not the REST URL or anon key. Use Project Settings → Database → Connection string.",
    );
  }
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  await migrateWithRetry();

  const forceImport = process.env.MIGRATE_FROM_SUPABASE_ON_BOOT === "1";
  const skipIfEmpty = process.env.MIGRATE_SKIP_IF_EMPTY === "1";
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();

  if (supabaseUrl) {
    assertPostgresUri(supabaseUrl);
    const profiles = await countProfiles(databaseUrl);
    const runImport = forceImport || (profiles === 0 && !skipIfEmpty);

    console.log(
      `[entrypoint] Supabase dump check: profiles=${profiles}, force=${forceImport}, skipIfEmpty=${skipIfEmpty}, willImport=${runImport}`,
    );

    if (runImport) {
      if (profiles === 0) {
        console.log("[entrypoint] profiles empty — importing users/config from Supabase…");
      } else {
        console.log("[entrypoint] MIGRATE_FROM_SUPABASE_ON_BOOT=1 — re-importing…");
      }
      await runNode("scripts/migrate-from-supabase.mjs");
      const after = await countProfiles(databaseUrl);
      console.log(`[entrypoint] Import finished. profiles now=${after}`);
      if (after === 0) {
        console.error(
          "[entrypoint] WARNING: profiles still 0. Likely wrong SUPABASE_DATABASE_URL or no access to auth.users / public.profiles on source.",
        );
      }
    } else {
      console.log("[entrypoint] Skipping Supabase import (DB already has profiles, or MIGRATE_SKIP_IF_EMPTY=1).");
    }
  } else {
    console.log(
      "[entrypoint] SUPABASE_DATABASE_URL not set — no data import. Empty profiles ⇒ bootstrap admin screen.",
    );
  }

  const server = path.join(root, ".output", "server", "index.mjs");
  console.log("[entrypoint] Starting server…");
  const child = spawn(process.execPath, [server], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code) => process.exit(code ?? 1));
}

main().catch((error) => {
  console.error("[entrypoint]", error);
  process.exit(1);
});
