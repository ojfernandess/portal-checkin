/**
 * Container entrypoint:
 * 1) Always apply schema migrations (idempotent).
 * 2) Optionally import from Supabase when MIGRATE_FROM_SUPABASE_ON_BOOT=1.
 * 3) Start the Nitro server.
 *
 * Env for data import:
 *   MIGRATE_FROM_SUPABASE_ON_BOOT=1
 *   SUPABASE_DATABASE_URL=postgresql://...
 *   DATABASE_URL=postgresql://...   (already required by the app)
 *
 * Optional: MIGRATE_TRUNCATE=1, MIGRATE_DRY_RUN=1 (dry-run then still starts server)
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[entrypoint] Missing DATABASE_URL — cannot migrate or start.");
    process.exit(1);
  }

  console.log("[entrypoint] Applying schema migrations…");
  await runNode("scripts/db-migrate.mjs");

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
