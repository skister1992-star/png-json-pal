// Dropbox adapter (App folder permission).
import {
  type CloudAdapter,
  type DocRow,
  type TableName,
  docFilename,
  parseDocFilename,
  uuid,
} from "./types";
import {
  createPkce,
  getStoredToken,
  isTokenValid,
  openOAuthPopup,
  redirectUri,
  setStoredToken,
} from "./oauth";
import { loadOAuthAppConfig } from "./app-config";

const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

async function getAccessToken(): Promise<string> {
  const tok = getStoredToken("dropbox");
  if (isTokenValid(tok)) return tok!.accessToken;
  if (tok?.refreshToken) {
    try {
      const refreshed = await refreshToken(tok.refreshToken);
      if (refreshed) return refreshed;
    } catch (e) {
      console.warn("dropbox refresh", e);
    }
  }
  throw new Error("Nicht mit Dropbox verbunden");
}

async function refreshToken(rt: string): Promise<string | null> {
  const cfg = await loadOAuthAppConfig();
  if (!cfg.dropbox_app_key) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: rt,
    client_id: cfg.dropbox_app_key,
  });
  const resp = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) return null;
  const j = (await resp.json()) as { access_token: string; expires_in: number };
  setStoredToken("dropbox", {
    accessToken: j.access_token,
    refreshToken: rt,
    expiresAt: Date.now() + j.expires_in * 1000,
  });
  return j.access_token;
}

export async function connectDropbox(): Promise<void> {
  const cfg = await loadOAuthAppConfig();
  if (!cfg.dropbox_app_key)
    throw new Error("Dropbox App-Key fehlt — bitte vom Admin eintragen lassen.");
  const state = uuid();
  const { verifier, challenge } = await createPkce();
  sessionStorage.setItem(`pkce_${state}`, verifier);
  const url =
    "https://www.dropbox.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(cfg.dropbox_app_key)}` +
    "&response_type=code" +
    `&redirect_uri=${encodeURIComponent(redirectUri())}` +
    "&token_access_type=offline" +
    `&code_challenge=${challenge}` +
    "&code_challenge_method=S256" +
    `&state=${state}`;
  const result = await openOAuthPopup(url, state);
  if (result.kind !== "code") throw new Error("Unerwartete OAuth-Antwort");

  const body = new URLSearchParams({
    code: result.code,
    grant_type: "authorization_code",
    client_id: cfg.dropbox_app_key,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });
  const resp = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error("Dropbox token exchange fehlgeschlagen: " + (await resp.text()));
  const j = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  setStoredToken("dropbox", {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + j.expires_in * 1000,
  });
  sessionStorage.removeItem(`pkce_${state}`);
}

export function disconnectDropbox() {
  setStoredToken("dropbox", null);
}

async function dfetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(path, { ...init, headers });
  if (resp.status === 401) {
    setStoredToken("dropbox", null);
    throw new Error("Dropbox Sitzung abgelaufen — bitte neu verbinden.");
  }
  return resp;
}

type DbxEntry = { ".tag": string; name: string; path_lower: string; server_modified?: string };

async function listFolder(): Promise<DbxEntry[]> {
  const resp = await dfetch(`${API}/files/list_folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "", recursive: false, limit: 2000 }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (t.includes("not_found")) return [];
    throw new Error("Dropbox list fehlgeschlagen: " + t);
  }
  const j = (await resp.json()) as { entries: DbxEntry[] };
  return (j.entries || []).filter((e) => e[".tag"] === "file");
}

async function downloadJson(filename: string): Promise<unknown> {
  const resp = await fetch(`${CONTENT}/files/download`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Dropbox-API-Arg": JSON.stringify({ path: "/" + filename }),
    },
  });
  if (!resp.ok) throw new Error("Dropbox download fehlgeschlagen");
  return await resp.json();
}

async function uploadJson(filename: string, payload: unknown): Promise<DbxEntry> {
  const resp = await fetch(`${CONTENT}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: "/" + filename,
        mode: "overwrite",
        autorename: false,
        mute: true,
      }),
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error("Dropbox upload fehlgeschlagen: " + (await resp.text()));
  return (await resp.json()) as DbxEntry;
}

export const dropboxAdapter: CloudAdapter = {
  id: "dropbox",
  async ensureReady() {
    await getAccessToken();
  },
  async list(table) {
    const all = await listFolder();
    const wanted = all.filter((f) => {
      const p = parseDocFilename(f.name);
      return p && p.table === table;
    });
    const rows: DocRow[] = [];
    for (const f of wanted) {
      const p = parseDocFilename(f.name)!;
      try {
        const payload = (await downloadJson(f.name)) as { name?: string; data?: unknown };
        rows.push({
          id: p.id,
          name: payload?.name || "Unnamed",
          data: payload?.data ?? null,
          updated_at: f.server_modified || new Date().toISOString(),
        });
      } catch (e) {
        console.warn("dropbox read", f.name, e);
      }
    }
    rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return rows;
  },
  async save(table, id, name, data) {
    const docId = id ?? uuid();
    const filename = docFilename(table, docId);
    const f = await uploadJson(filename, { name, data });
    return {
      id: docId,
      name,
      data,
      updated_at: f.server_modified || new Date().toISOString(),
    };
  },
  async remove(table, id) {
    const filename = docFilename(table, id);
    const resp = await dfetch(`${API}/files/delete_v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/" + filename }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      if (t.includes("not_found")) return;
      throw new Error("Dropbox delete fehlgeschlagen: " + t);
    }
  },
};
