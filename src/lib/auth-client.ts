export const AUTH_TOKEN_STORAGE_KEY = "welcome-inn-access-token";
export const AUTH_USER_STORAGE_KEY = "welcome-inn-auth-user";

export type ClientAuthUser = {
  id: string;
  email: string;
  fullName?: string | null;
};

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredAuthUser(): ClientAuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClientAuthUser;
    if (!parsed?.id || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAuthSession(input: { accessToken: string; user: ClientAuthUser }): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, input.accessToken);
  localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(input.user));
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
}

/** Compat layer replacing supabase.auth for staff UI. */
export const appAuth = {
  async getSession() {
    const access_token = getStoredAccessToken();
    const user = getStoredAuthUser();
    if (!access_token || !user) return { data: { session: null } };
    return {
      data: {
        session: {
          access_token,
          user: { id: user.id, email: user.email, user_metadata: { full_name: user.fullName } },
        },
      },
    };
  },
  async getUser() {
    const user = getStoredAuthUser();
    if (!user) return { data: { user: null }, error: new Error("Not authenticated") };
    return {
      data: {
        user: { id: user.id, email: user.email, user_metadata: { full_name: user.fullName } },
      },
      error: null,
    };
  },
  async signOut() {
    clearAuthSession();
    return { error: null };
  },
};
