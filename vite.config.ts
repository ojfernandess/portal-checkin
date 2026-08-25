// TanStack Start Vite config — includes devtools, tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, etc.
// Do not duplicate those plugins manually or the app may break.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { startStorageContextClientStubPlugin } from "./src/lib/vite/start-storage-context-client-stub-plugin.ts";

const root = path.dirname(fileURLToPath(import.meta.url));
const csrfMiddlewareShim = path.resolve(root, "src/lib/shims/createCsrfMiddleware.server.ts");
const startStorageContextClientStub = path.resolve(
  root,
  "src/lib/shims/start-storage-context.client.ts",
);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Lovable defineConfig only forwards `vite`, `plugins`, tanstackStart, nitro, etc. — not bare resolve/environments.
  plugins: [startStorageContextClientStubPlugin(startStorageContextClientStub)],
  vite: {
    resolve: {
      alias: {
        "@tanstack/start-client-core/dist/esm/createCsrfMiddleware.js": csrfMiddlewareShim,
      },
    },
    optimizeDeps: {
      exclude: ["@tanstack/start-client-core"],
    },
  },
  // Docker / EasyPanel / Node: node-server (default). Lovable sandbox still forces cloudflare-module.
  nitro: {
    preset: process.env.NITRO_PRESET ?? "node-server",
  },
});
