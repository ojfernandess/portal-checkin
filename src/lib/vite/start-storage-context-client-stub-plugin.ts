import path from "node:path";
import type { Plugin } from "vite";

const STORAGE_CONTEXT = "@tanstack/start-storage-context";

/** Stub AsyncLocalStorage for the browser — real module uses node:async_hooks. */
export function startStorageContextClientStubPlugin(stubPath: string): Plugin {
  const normalizedStub = path.normalize(stubPath);

  const clientAlias = {
    [STORAGE_CONTEXT]: normalizedStub,
  };

  return {
    name: "start-storage-context-client-stub",
    enforce: "pre",
    configEnvironment(name) {
      if (name !== "client") return;
      return {
        resolve: {
          alias: clientAlias,
        },
        optimizeDeps: {
          rolldownOptions: {
            resolve: {
              alias: clientAlias,
            },
          },
        },
      };
    },
    resolveId(source, _importer, options) {
      if (this.environment.name !== "client") return null;
      if (options?.ssr === true) return null;
      if (source === STORAGE_CONTEXT || source.startsWith(`${STORAGE_CONTEXT}/`)) {
        return normalizedStub;
      }
      return null;
    },
  };
}
