import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createAppDbClient } from "@/lib/db-query.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }
    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token.split(".").length !== 3) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { verifyAccessToken } = await import("@/lib/auth.server");
    let userId: string;
    try {
      const user = await verifyAccessToken(token);
      userId = user.id;
    } catch {
      throw new Error("Unauthorized: Invalid token");
    }

    const supabase = createAppDbClient();

    return next({
      context: {
        supabase,
        userId,
        claims: { sub: userId },
      },
    });
  },
);

export const requireAuth = requireSupabaseAuth;
