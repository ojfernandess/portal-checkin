/**
 * TanStack Start evaluates defaultCsrfMiddleware at module load. Nitro's Linux SSR
 * bundle can resolve createMiddleware incorrectly inside createCsrfMiddleware, crashing
 * the server before handling requests. We define startInstance with our own CSRF
 * middleware, so the framework default is never used — replace it with a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ssrDir = path.join(root, ".output", "server", "_ssr");

const TARGET =
  'var defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });';
const REPLACEMENT =
  'var defaultCsrfMiddleware = { options: { type: "request", server: async (ctx) => ctx.next() } };';

function patchFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes(TARGET)) return false;
  fs.writeFileSync(filePath, source.replace(TARGET, REPLACEMENT));
  console.log(`[patch-nitro-csrf] patched ${path.relative(root, filePath)}`);
  return true;
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`[patch-nitro-csrf] directory not found: ${dir}`);
    return 0;
  }

  let patched = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patched += walk(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.startsWith("server-") && entry.name.endsWith(".mjs")) {
      if (patchFile(fullPath)) patched += 1;
    }
  }
  return patched;
}

const patchedCount = walk(ssrDir);
if (patchedCount === 0) {
  console.warn("[patch-nitro-csrf] no server bundles patched — pattern may have changed");
  process.exit(1);
}

console.log(`[patch-nitro-csrf] done (${patchedCount} file(s))`);
