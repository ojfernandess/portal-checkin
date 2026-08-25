/**
 * Post-build patches for Nitro SSR bundles:
 * 1. CSRF — TanStack Start evaluates defaultCsrfMiddleware at module load; Nitro's Linux
 *    bundle can resolve createMiddleware incorrectly. We use our own CSRF in start.ts.
 * 2. __exportAll — Rolldown splits createMiddleware/__exportAll into a helper chunk that
 *    circularly imports the main server chunk; Node then loads __exportAll before it exists.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ssrDir = path.join(root, ".output", "server", "_ssr");

const CSRF_TARGET =
  'var defaultCsrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" });';
const CSRF_REPLACEMENT =
  'var defaultCsrfMiddleware = { options: { type: "request", server: async (ctx) => ctx.next() } };';

const EXPORT_ALL_IMPORT =
  /import \{ n as createMiddleware, r as __exportAll \} from "\.\/(server-[^"]+\.mjs)";/;

const EXPORT_ALL_INLINE = (helperImport) => `var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
import { n as createMiddleware } from "./${helperImport}";`;

function patchCsrf(source) {
  if (!source.includes(CSRF_TARGET)) return { source, changed: false };
  return {
    source: source.replace(CSRF_TARGET, CSRF_REPLACEMENT),
    changed: true,
  };
}

function patchExportAll(source) {
  const match = EXPORT_ALL_IMPORT.exec(source);
  if (!match) return { source, changed: false };
  return {
    source: source.replace(EXPORT_ALL_IMPORT, EXPORT_ALL_INLINE(match[1])),
    changed: true,
  };
}

function patchFile(filePath) {
  let source = fs.readFileSync(filePath, "utf8");
  let csrfPatched = false;
  let exportAllPatched = false;

  const csrf = patchCsrf(source);
  if (csrf.changed) {
    source = csrf.source;
    csrfPatched = true;
  }

  const exportAll = patchExportAll(source);
  if (exportAll.changed) {
    source = exportAll.source;
    exportAllPatched = true;
  }

  if (csrfPatched || exportAllPatched) {
    fs.writeFileSync(filePath, source);
    console.log(`[patch-nitro-ssr] patched ${path.relative(root, filePath)}`);
  }

  return { csrf: csrfPatched, exportAll: exportAllPatched };
}

function walk(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`[patch-nitro-ssr] directory not found: ${dir}`);
    return { csrf: 0, exportAll: 0 };
  }

  const counts = { csrf: 0, exportAll: 0 };
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = walk(fullPath);
      counts.csrf += nested.csrf;
      counts.exportAll += nested.exportAll;
      continue;
    }
    if (entry.isFile() && entry.name.startsWith("server-") && entry.name.endsWith(".mjs")) {
      const result = patchFile(fullPath);
      if (result.csrf) counts.csrf += 1;
      if (result.exportAll) counts.exportAll += 1;
    }
  }
  return counts;
}

const { csrf, exportAll } = walk(ssrDir);

if (exportAll === 0) {
  console.error("[patch-nitro-ssr] __exportAll circular-import patch was not applied");
  process.exit(1);
}

if (csrf === 0) {
  console.warn("[patch-nitro-ssr] CSRF patch was not applied — pattern may have changed");
}

console.log(`[patch-nitro-ssr] done (csrf: ${csrf}, exportAll: ${exportAll})`);
