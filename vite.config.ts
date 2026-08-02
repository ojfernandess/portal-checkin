// TanStack Start Vite config — includes devtools, tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, etc.
// Do not duplicate those plugins manually or the app may break.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Docker / EasyPanel / Node: node-server (default). Lovable sandbox still forces cloudflare-module.
  nitro: {
    preset: process.env.NITRO_PRESET ?? "node-server",
  },
});
