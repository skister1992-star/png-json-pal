// Microsoft OneDrive adapter (App Folder via /me/drive/special/approot).
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

const SCOPES = "Files.ReadWrite.AppFolder offline_access";
const GRAPH = "https://graph.microsoft.com/v1.0";

async function getAccessToken(): Promise<string> {
  const tok = getStoredToken("onedrive");
  if (isTokenValid(tok)) return tok!.accessToken;
  // Try refresh
  if (tok?.refreshToken) {
    try {
      const refreshed = await refreshToken(tok.refreshToken);
      if (refreshed) return refreshed;
    } catch (e) {
      console.warn("onedrive refresh failed", e);
    }
  }
  throw new Error("Nicht mit OneDrive verbunden");
}

async function refreshToken(rt: string): Promise<string | null> {
  const cfg = await loadOAuthAppConfig();
  if (!cfg.microsoft_client_id) return null;
  const body = new URLSearchParams({
    client_id: cfg.microsoft_client_id,
    grant_type: "refresh_token",
    refresh_token: rt,
    scope: SCOPES,
    redirect_uri: redirectUri(),
  });
  const resp = await fetch(
    `https://login.microsoftonline.com/${cfg.microsoft_tenant || "common"}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!resp.ok) return null;
  const j = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  setStoredToken("onedrive", {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || rt,
    expiresAt: Date.now() + j.expires_in * 1000,
  });
  return j.access_token;
}

export async function connectOneDrive(): Promise<void> {
  const cfg = await loadOAuthAppConfig();
  if (!cfg.microsoft_client_id)
    throw new Error("Microsoft Client-ID fehlt — bitte vom Admin eintragen lassen.");
  const state = uuid();
  const { verifier, challenge } = await createPkce();
  sessionStorage.setItem(`pkce_${state}`, verifier);
  const url =
    `https://login.microsoftonline.com/${cfg.microsoft_tenant || "common"}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(cfg.microsoft_client_id)}` +
    "&response_type=code" +
    `&redirect_uri=${encodeURIComponent(redirectUri())}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    "&response_mode=query" +
    `&code_challenge=${challenge}` +
    "&code_challenge_method=S256" +
    `&state=${state}`;
  const result = await openOAuthPopup(url, state);
  if (result.kind !== "code") throw new Error("Unerwartete OAuth-Antwort");

  const body = new URLSearchParams({
    client_id: cfg.microsoft_client_id,
    grant_type: "authorization_code",
    code: result.code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
    scope: SCOPES,
  });
  const resp = await fetch(
    `https://login.microsoftonline.com/${cfg.microsoft_tenant || "common"}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!resp.ok) throw new Error("MS token exchange fehlgeschlagen: " + (await resp.text()));
  const j = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  setStoredToken("onedrive", {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + j.expires_in * 1000,
  });
  sessionStorage.removeItem(`pkce_${state}`);
}

export function disconnectOneDrive() {
  setStoredToken("onedrive", null);
}

async function gfetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(path, { ...init, headers });
  if (resp.status === 401) {
    setStoredToken("onedrive", null);
    throw new Error("OneDrive Sitzung abgelaufen — bitte neu verbinden.");
  }
  return resp;
}

type DriveItem = { id: string; name: string; lastModifiedDateTime?: string };

async function listChildren(): Promise<DriveItem[]> {
  const resp = await gfetch(`${GRAPH}/me/drive/special/approot/children?$top=999`);
  if (!resp.ok) throw new Error("OneDrive list fehlgeschlagen: " + (await resp.text()));
  const j = (await resp.json()) as { value: DriveItem[] };
  return j.value || [];
}

async function downloadJson(filename: string): Promise<unknown> {
  const resp = await gfetch(
    `${GRAPH}/me/drive/special/approot:/${encodeURIComponent(filename)}:/content`,
  );
  if (!resp.ok) throw new Error("OneDrive download fehlgeschlagen");
  return await resp.json();
}

async function uploadJson(filename: string, payload: unknown): Promise<DriveItem> {
  const resp = await gfetch(
    `${GRAPH}/me/drive/special/approot:/${encodeURIComponent(filename)}:/content`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) throw new Error("OneDrive upload fehlgeschlagen: " + (await resp.text()));
  return (await resp.json()) as DriveItem;
}

export const oneDriveAdapter: CloudAdapter = {
  id: "onedrive",
  async ensureReady() {
    await getAccessToken();
  },
  async list(table) {
    const all = await listChildren();
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
          updated_at: f.lastModifiedDateTime || new Date().toISOString(),
        });
      } catch (e) {
        console.warn("onedrive read", f.name, e);
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
      updated_at: f.lastModifiedDateTime || new Date().toISOString(),
    };
  },
  async remove(table, id) {
    const filename = docFilename(table, id);
    const resp = await gfetch(
      `${GRAPH}/me/drive/special/approot:/${encodeURIComponent(filename)}`,
      { method: "DELETE" },
    );
    if (!resp.ok && resp.status !== 404)
      throw new Error("OneDrive delete fehlgeschlagen: " + (await resp.text()));
  },
};
