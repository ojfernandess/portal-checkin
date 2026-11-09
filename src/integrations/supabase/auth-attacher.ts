import { createMiddleware } from "@tanstack/react-start";
import { getStoredAccessToken } from "@/lib/auth-client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = getStoredAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);

export const attachAuth = attachSupabaseAuth;
