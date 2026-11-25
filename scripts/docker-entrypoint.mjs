/**
 * Container entrypoint:
 * 1) Resolve DATABASE_URL from POSTGRES_* (avoids EasyPanel URL/password drift).
 * 2) Apply schema migrations (idempotent), with retries while Postgres syncs password.
 * 3) Optionally import from Supabase when MIGRATE_FROM_SUPABASE_ON_BOOT=1.
 * 4) Start the Nitro server.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDatabaseUrl() {
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const user = (process.env.POSTGRES_USER?.trim() || "welcome");
  const db = (process.env.POSTGRES_DB?.trim() || "welcome_inn");
  const host = (process.env.POSTGRES_HOST?.trim() || "postgres");
  const port = (process.env.POSTGRES_PORT?.trim() || "5432");

  // Prefer POSTGRES_* so DATABASE_URL cannot drift from the password Postgres syncs on boot.
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

async function main() {
  resolveDatabaseUrl();

  await migrateWithRetry();

  const importOnBoot = process.env.MIGRATE_FROM_SUPABASE_ON_BOOT === "1";
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL?.trim();

  if (importOnBoot) {
    if (!supabaseUrl) {
      console.error(
        "[entrypoint] MIGRATE_FROM_SUPABASE_ON_BOOT=1 but SUPABASE_DATABASE_URL is missing.",
      );
      process.exit(1);
    }
    console.log("[entrypoint] Importing data from Supabase…");
    console.log("[entrypoint] Watch logs for table counts and 'Done.'");
    await runNode("scripts/migrate-from-supabase.mjs");
    console.log(
      "[entrypoint] Supabase import finished. Set MIGRATE_FROM_SUPABASE_ON_BOOT=0 on next deploy to skip re-import.",
    );
  } else if (supabaseUrl) {
    console.log(
      "[entrypoint] SUPABASE_DATABASE_URL is set but MIGRATE_FROM_SUPABASE_ON_BOOT is not 1 — skipping data import.",
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
