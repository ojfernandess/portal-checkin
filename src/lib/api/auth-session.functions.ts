import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(6).max(200),
  fullName: z.string().trim().max(200).optional(),
});

export const authLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    credentialsSchema.pick({ email: true, password: true }).parse(input),
  )
  .handler(async ({ data }) => {
    const { loginWithPassword } = await import("@/lib/auth.server");
    const result = await loginWithPassword(data);
    return {
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
    };
  });

export const authBootstrap = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credentialsSchema.parse(input))
  .handler(async ({ data }) => {
    const { bootstrapFirstAdmin } = await import("@/lib/auth.server");
    const result = await bootstrapFirstAdmin({
      email: data.email,
      password: data.password,
      fullName: data.fullName ?? null,
    });
    return {
      accessToken: result.accessToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
    };
  });

export const authMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { verifyAccessToken, findAuthUserById } = await import("@/lib/auth.server");
  const request = getRequest();
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return { user: null };
  try {
    const claims = await verifyAccessToken(token);
    const user = await findAuthUserById(claims.id);
    if (!user) return { user: null };
    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  } catch {
    return { user: null };
  }
});
