import { createMiddleware } from "@tanstack/react-start";

export type PlatformContext = {
  isPlatformAdmin: true;
};

export const requirePlatformAdmin = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const authContext = context as {
      supabase: {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: Error | null }>;
      };
      userId: string;
    };

    const { data, error } = await authContext.supabase.rpc("is_platform_admin", {
      _user_id: authContext.userId,
    });

    if (error) throw new Error(error.message);
    if (!data) {
      throw new Error("Acesso negado: permissão de Super Admin necessária.");
    }

    return next({
      context: {
        isPlatformAdmin: true as const,
      } satisfies PlatformContext,
    });
  },
);
