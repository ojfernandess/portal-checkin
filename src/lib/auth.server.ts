import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { query, withTransaction } from "@/lib/db.server";

const AUTH_TOKEN_STORAGE_ISSUE = "AUTH_JWT_SECRET";

function getJwtSecret(): Uint8Array {
  const secret = process.env["AUTH_JWT_SECRET"]?.trim();
  if (!secret || secret.length < 16) {
    throw new Error(`Missing or weak ${AUTH_TOKEN_STORAGE_ISSUE}. Use at least 16 characters.`);
  }
  return new TextEncoder().encode(secret);
}

function getJwtTtl(): string {
  return process.env["AUTH_JWT_TTL"]?.trim() || "7d";
}

export type AuthUserRecord = {
  id: string;
  email: string;
  fullName: string | null;
  passwordHash: string;
};

export type AuthSessionUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function createAccessToken(user: AuthSessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    full_name: user.fullName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(getJwtTtl())
    .sign(getJwtSecret());
}

export async function verifyAccessToken(token: string): Promise<AuthSessionUser> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const userId = payload.sub;
  if (!userId) throw new Error("Unauthorized: Invalid token");
  const email = typeof payload["email"] === "string" ? payload["email"] : "";
  const fullName =
    typeof payload["full_name"] === "string" ? payload["full_name"] : null;
  return { id: userId, email, fullName };
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const { rows } = await query<{
    id: string;
    email: string;
    full_name: string | null;
    password_hash: string;
  }>("SELECT id, email, full_name, password_hash FROM auth_users WHERE lower(email) = $1 LIMIT 1", [
    normalized,
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash,
  };
}

export async function findAuthUserById(userId: string): Promise<AuthSessionUser | null> {
  const { rows } = await query<{ id: string; email: string; full_name: string | null }>(
    "SELECT id, email, full_name FROM auth_users WHERE id = $1 LIMIT 1",
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, email: row.email, fullName: row.full_name };
}

export async function countProfiles(): Promise<number> {
  const { rows } = await query<{ count: string }>("SELECT COUNT(*)::text AS count FROM profiles");
  return Number(rows[0]?.count ?? 0);
}

export async function createAuthUser(input: {
  email: string;
  password: string;
  fullName?: string | null;
  makePlatformAdmin?: boolean;
  role?: "admin" | "reception";
}): Promise<AuthSessionUser> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName?.trim() || null;
  const passwordHash = await hashPassword(input.password);
  const role = input.role ?? "reception";

  return withTransaction(async (client) => {
    const inserted = await client.query<{ id: string; email: string; full_name: string | null }>(
      `INSERT INTO auth_users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name`,
      [email, passwordHash, fullName],
    );
    const user = inserted.rows[0];
    if (!user) throw new Error("Failed to create user.");

    await client.query(
      `INSERT INTO profiles (id, email, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, updated_at = now()`,
      [user.id, user.email, user.full_name],
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, $2::app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [user.id, role],
    );

    if (input.makePlatformAdmin) {
      await client.query(
        `INSERT INTO platform_admins (user_id)
         VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      );
    }

    return { id: user.id, email: user.email, fullName: user.full_name };
  });
}

export async function bootstrapFirstAdmin(input: {
  email: string;
  password: string;
  fullName?: string | null;
}): Promise<{ user: AuthSessionUser; accessToken: string }> {
  const existing = await countProfiles();
  if (existing > 0) {
    throw new Error("Bootstrap already completed.");
  }
  const user = await createAuthUser({
    email: input.email,
    password: input.password,
    ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
    makePlatformAdmin: true,
    role: "admin",
  });
  const accessToken = await createAccessToken(user);
  return { user, accessToken };
}

export async function loginWithPassword(input: {
  email: string;
  password: string;
}): Promise<{ user: AuthSessionUser; accessToken: string }> {
  const found = await findAuthUserByEmail(input.email);
  if (!found) throw new Error("Invalid login credentials");
  const ok = await verifyPassword(input.password, found.passwordHash);
  if (!ok) throw new Error("Invalid login credentials");
  const user = { id: found.id, email: found.email, fullName: found.fullName };
  const accessToken = await createAccessToken(user);
  return { user, accessToken };
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await query("DELETE FROM auth_users WHERE id = $1", [userId]);
}
