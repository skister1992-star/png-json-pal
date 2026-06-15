// API-Client für den eigenen Self-Hosted Backend-Server (server/).
//
// Verwendung im Frontend:
//   import { api } from "@/lib/api-client";
//   await api.login(email, password);
//   const me = await api.me();
//   api.loginWithGoogle();        // Browser-Redirect
//
// Konfiguration:
//   - Wenn Frontend & Server unter gleicher Domain laufen: nichts setzen
//     (alle Pfade sind same-origin "/api/...").
//   - Wenn unterschiedlich: VITE_API_BASE_URL=https://api.example.com setzen.

const BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export type AppUser = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string | null;
  banned_until: string | null;
  provider: "google" | "email";
};

export type AppConfig = {
  google_login_enabled: boolean;
};

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (body as { message?: string; error?: string })?.message ??
      (body as { error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export const api = {
  // ---- Public config ----
  async config(): Promise<AppConfig> {
    return req<AppConfig>("/api/config");
  },

  // ---- Email/Passwort Auth ----
  async register(email: string, password: string): Promise<{ user: AppUser }> {
    return req("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async login(email: string, password: string): Promise<{ user: AppUser }> {
    return req("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  async logout(): Promise<void> {
    await req("/api/auth/logout", { method: "POST" });
  },
  async me(): Promise<AppUser | null> {
    try {
      const r = await req<{ user: AppUser }>("/api/auth/me");
      return r.user;
    } catch {
      return null;
    }
  },

  // ---- Google OAuth (Server-Redirect) ----
  loginWithGoogle(redirectAfter?: string): void {
    const q = redirectAfter
      ? `?redirect=${encodeURIComponent(redirectAfter)}`
      : "";
    window.location.href = `${BASE}/api/auth/google/start${q}`;
  },

  // ---- Admin ----
  admin: {
    async login(password: string): Promise<void> {
      await req("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
    },
    async logout(): Promise<void> {
      await req("/api/admin/logout", { method: "POST" });
    },
    async check(): Promise<boolean> {
      try {
        await req("/api/admin/me");
        return true;
      } catch {
        return false;
      }
    },
    async changePassword(newPassword: string): Promise<void> {
      await req("/api/admin/password", {
        method: "PUT",
        body: JSON.stringify({ newPassword }),
      });
    },
    async getOAuth(): Promise<{
      google_client_id: string;
      google_client_secret: string;
      google_redirect_uri: string;
    }> {
      return req("/api/admin/oauth");
    },
    async setOAuth(cfg: {
      google_client_id: string;
      google_client_secret: string;
      google_redirect_uri: string;
    }): Promise<void> {
      await req("/api/admin/oauth", {
        method: "PUT",
        body: JSON.stringify(cfg),
      });
    },
    async listUsers(): Promise<AppUser[]> {
      return req("/api/admin/users");
    },
    async deleteUser(id: string): Promise<void> {
      await req(`/api/admin/users/${id}`, { method: "DELETE" });
    },
    async banUser(id: string, ban: boolean): Promise<void> {
      await req(`/api/admin/users/${id}/ban`, {
        method: "POST",
        body: JSON.stringify({ ban }),
      });
    },
  },
};
