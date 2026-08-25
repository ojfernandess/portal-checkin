export type AppBuildInfo = {
  commit: string;
  builtAt: string | null;
  /** Routes added in inbox release — quick deploy smoke test. */
  features: {
    inboxModule: boolean;
  };
};

export function readAppBuildInfo(): AppBuildInfo {
  return {
    commit: process.env.APP_BUILD_COMMIT?.trim() || "unknown",
    builtAt: process.env.APP_BUILD_DATE?.trim() || null,
    features: {
      inboxModule: true,
    },
  };
}

export function buildInfoResponse(): Response {
  return new Response(JSON.stringify(readAppBuildInfo(), null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
