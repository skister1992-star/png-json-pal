// API-Client für den eigenen Self-Hosted Backend-Server (server/).
//
// Im Lovable-Preview (Cloudflare Workers, kein Node/SQLite) existiert dieser
// Server NICHT. Damit der Adminbereich & Login dort trotzdem nutzbar bleiben,
// fällt der Client automatisch in einen lokalen Demo-Modus (localStorage)
// zurück, sobald die Backend-Endpunkte mit 404 antworten oder nicht
// erreichbar sind. Auf einem eigenen Server (mit dem `server/`-Projekt unter
// gleicher Domain) wird automatisch der echte Backend-Modus verwendet.

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

// ───────────────────────────────────────────── Demo-Modus (localStorage) ──

const DEMO_KEY = "lov-demo-backend-v1";
type DemoUser = AppUser & { password_hash: string };
type DemoState = {
  users: DemoUser[];
  currentUserId: string | null;
  adminAuthed: boolean;
  adminPassword: string;
  oauth: {
    google_client_id: string;
    google_client_secret: string;
    google_redirect_uri: string;
  };
};

function loadDemo(): DemoState {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    /* ignore */
  }
  return {
    users: [],
    currentUserId: null,
    adminAuthed: false,
    adminPassword: "root",
    oauth: {
      google_client_id: "",
      google_client_secret: "",
      google_redirect_uri: "",
    },
  };
}
function saveDemo(s: DemoState) {
  try {
    localStorage.setItem(DEMO_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// einfache "Hash"-Funktion nur fürs Demo (kein bcrypt im Browser)
async function demoHash(pw: string): Promise<string> {
  const buf = new TextEncoder().encode(pw + "::lov-demo");
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ───────────────────────────────────────────── Backend-Erreichbarkeit ──

let backendAvailable: boolean | null = null;

async function probeBackend(): Promise<boolean> {
  if (backendAvailable !== null) return backendAvailable;
  try {
    const res = await fetch(`${BASE}/api/config`, { credentials: "include" });
    backendAvailable = res.ok;
  } catch {
    backendAvailable = false;
  }
  return backendAvailable ?? false;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 404) {
    backendAvailable = false;
    throw new Error("__NO_BACKEND__");
  }
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

// Wrapper: versucht echten Backend-Call, fällt bei „kein Backend" auf Demo zurück.
async function tryReq<T>(path: string, init: RequestInit, demo: () => Promise<T> | T): Promise<T> {
  if (backendAvailable === false) return await demo();
  try {
    return await req<T>(path, init);
  } catch (e) {
    if ((e as Error).message === "__NO_BACKEND__" || backendAvailable === false) {
      return await demo();
    }
    throw e;
  }
}

// ───────────────────────────────────────────── Public API ──

export const api = {
  isDemoMode(): boolean {
    return backendAvailable === false;
  },

  async config(): Promise<AppConfig> {
    const available = await probeBackend();
    if (!available) {
      const s = loadDemo();
      return { google_login_enabled: !!s.oauth.google_client_id };
    }
    return req<AppConfig>("/api/config");
  },

  // ---- Email/Passwort Auth ----
  async register(email: string, password: string): Promise<{ user: AppUser }> {
    return tryReq(
      "/api/auth/register",
      { method: "POST", body: JSON.stringify({ email, password }) },
      async () => {
        const s = loadDemo();
        if (s.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
          throw new Error("E-Mail bereits registriert");
        }
        const now = new Date().toISOString();
        const user: DemoUser = {
          id: crypto.randomUUID(),
          email,
          display_name: email.split("@")[0],
          avatar_url: null,
          created_at: now,
          last_login_at: now,
          banned_until: null,
          provider: "email",
          password_hash: await demoHash(password),
        };
        s.users.push(user);
        s.currentUserId = user.id;
        saveDemo(s);
        const { password_hash, ...pub } = user;
        return { user: pub };
      },
    );
  },

  async login(email: string, password: string): Promise<{ user: AppUser }> {
    return tryReq(
      "/api/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      async () => {
        const s = loadDemo();
        const u = s.users.find((x) => x.email.toLowerCase() === email.toLowerCase());
        if (!u) throw new Error("Unbekannte E-Mail");
        const h = await demoHash(password);
        if (u.password_hash !== h) throw new Error("Falsches Passwort");
        if (u.banned_until && new Date(u.banned_until) > new Date()) {
          throw new Error("Konto gesperrt");
        }
        u.last_login_at = new Date().toISOString();
        s.currentUserId = u.id;
        saveDemo(s);
        const { password_hash, ...pub } = u;
        return { user: pub };
      },
    );
  },

  async logout(): Promise<void> {
    await tryReq<void>(
      "/api/auth/logout",
      { method: "POST" },
      async () => {
        const s = loadDemo();
        s.currentUserId = null;
        saveDemo(s);
      },
    );
  },

  async me(): Promise<AppUser | null> {
    if (backendAvailable === false) {
      const s = loadDemo();
      const u = s.users.find((x) => x.id === s.currentUserId);
      if (!u) return null;
      const { password_hash, ...pub } = u;
      return pub;
    }
    try {
      const r = await req<{ user: AppUser }>("/api/auth/me");
      return r.user;
    } catch (e) {
      if ((e as Error).message === "__NO_BACKEND__") return api.me();
      return null;
    }
  },

  loginWithGoogle(redirectAfter?: string): void {
    if (backendAvailable === false) {
      // Im Demo-Modus existiert kein Server für den OAuth-Flow.
      throw new Error(
        "Google-Login benötigt den eigenen Server. Im Preview-Modus nicht verfügbar.",
      );
    }
    const q = redirectAfter ? `?redirect=${encodeURIComponent(redirectAfter)}` : "";
    window.location.href = `${BASE}/api/auth/google/start${q}`;
  },

  // ---- Admin ----
  admin: {
    async login(password: string): Promise<void> {
      await tryReq<void>(
        "/api/admin/login",
        { method: "POST", body: JSON.stringify({ password }) },
        async () => {
          const s = loadDemo();
          if (password !== s.adminPassword) throw new Error("Falsches Admin-Passwort");
          s.adminAuthed = true;
          saveDemo(s);
        },
      );
    },
    async logout(): Promise<void> {
      await tryReq<void>(
        "/api/admin/logout",
        { method: "POST" },
        async () => {
          const s = loadDemo();
          s.adminAuthed = false;
          saveDemo(s);
        },
      );
    },
    async check(): Promise<boolean> {
      if (backendAvailable === false) return loadDemo().adminAuthed;
      try {
        await req("/api/admin/me");
        return true;
      } catch (e) {
        if ((e as Error).message === "__NO_BACKEND__") return loadDemo().adminAuthed;
        return false;
      }
    },
    async changePassword(newPassword: string): Promise<void> {
      await tryReq<void>(
        "/api/admin/password",
        { method: "PUT", body: JSON.stringify({ newPassword }) },
        async () => {
          const s = loadDemo();
          s.adminPassword = newPassword;
          saveDemo(s);
        },
      );
    },
    async getOAuth() {
      return tryReq(
        "/api/admin/oauth",
        {},
        async () => loadDemo().oauth,
      );
    },
    async setOAuth(cfg: {
      google_client_id: string;
      google_client_secret: string;
      google_redirect_uri: string;
    }): Promise<void> {
      await tryReq<void>(
        "/api/admin/oauth",
        { method: "PUT", body: JSON.stringify(cfg) },
        async () => {
          const s = loadDemo();
          s.oauth = cfg;
          saveDemo(s);
        },
      );
    },
    async listUsers(): Promise<AppUser[]> {
      return tryReq<AppUser[]>(
        "/api/admin/users",
        {},
        async () => loadDemo().users.map(({ password_hash, ...u }) => u),
      );
    },
    async deleteUser(id: string): Promise<void> {
      await tryReq<void>(
        `/api/admin/users/${id}`,
        { method: "DELETE" },
        async () => {
          const s = loadDemo();
          s.users = s.users.filter((u) => u.id !== id);
          if (s.currentUserId === id) s.currentUserId = null;
          saveDemo(s);
        },
      );
    },
    async banUser(id: string, ban: boolean): Promise<void> {
      await tryReq<void>(
        `/api/admin/users/${id}/ban`,
        { method: "POST", body: JSON.stringify({ ban }) },
        async () => {
          const s = loadDemo();
          const u = s.users.find((x) => x.id === id);
          if (u) {
            u.banned_until = ban
              ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10).toISOString()
              : null;
            saveDemo(s);
          }
        },
      );
    },
  },
};
