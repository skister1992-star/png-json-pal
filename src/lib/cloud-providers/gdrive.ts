// Google Drive adapter using appDataFolder (hidden per-app data).
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

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

async function getAccessToken(): Promise<string> {
  const tok = getStoredToken("gdrive");
  if (isTokenValid(tok)) return tok!.accessToken;
  throw new Error("Nicht mit Google Drive verbunden");
}

export async function connectGoogleDrive(): Promise<void> {
  const cfg = await loadOAuthAppConfig();
  if (!cfg.google_client_id)
    throw new Error("Google Client-ID fehlt — bitte vom Admin im Adminbereich eintragen lassen.");
  const state = uuid();
  const { verifier, challenge } = await createPkce();
  sessionStorage.setItem(`pkce_${state}`, verifier);
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth" +
    `?client_id=${encodeURIComponent(cfg.google_client_id)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri())}` +
    "&response_type=code" +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&code_challenge=${challenge}` +
    "&code_challenge_method=S256" +
    "&access_type=online" +
    "&prompt=consent" +
    `&state=${state}`;
  const result = await openOAuthPopup(url, state);
  if (result.kind !== "code") throw new Error("Unerwartete OAuth-Antwort");

  // Exchange code for token (PKCE → no client_secret needed for Drive public client)
  const body = new URLSearchParams({
    client_id: cfg.google_client_id,
    code: result.code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error("Google token exchange fehlgeschlagen: " + t);
  }
  const j = (await resp.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    token_type?: string;
  };
  setStoredToken("gdrive", {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + j.expires_in * 1000,
    tokenType: j.token_type,
  });
  sessionStorage.removeItem(`pkce_${state}`);
}

export function disconnectGoogleDrive() {
  setStoredToken("gdrive", null);
}

async function gfetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(path, { ...init, headers });
  if (resp.status === 401) {
    setStoredToken("gdrive", null);
    throw new Error("Google Drive Sitzung abgelaufen — bitte neu verbinden.");
  }
  return resp;
}

type DriveFile = { id: string; name: string; modifiedTime?: string };

async function listFilesByName(): Promise<DriveFile[]> {
  const q = encodeURIComponent("trashed=false");
  const resp = await gfetch(
    `${API}/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&pageSize=1000&q=${q}`,
  );
  if (!resp.ok) throw new Error("Drive list fehlgeschlagen: " + (await resp.text()));
  const j = (await resp.json()) as { files: DriveFile[] };
  return j.files || [];
}

async function downloadJson(fileId: string): Promise<unknown> {
  const resp = await gfetch(`${API}/files/${fileId}?alt=media`);
  if (!resp.ok) throw new Error("Drive download fehlgeschlagen");
  return await resp.json();
}

async function uploadJson(
  fileId: string | null,
  filename: string,
  payload: unknown,
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: filename };
  if (!fileId) metadata.parents = ["appDataFolder"];

  const boundary = "----lov" + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\n` +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    "Content-Type: application/json\r\n\r\n" +
    JSON.stringify(payload) +
    `\r\n--${boundary}--`;

  const url = fileId
    ? `${UPLOAD}/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`;
  const resp = await gfetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!resp.ok) throw new Error("Drive upload fehlgeschlagen: " + (await resp.text()));
  return (await resp.json()) as DriveFile;
}

export const googleDriveAdapter: CloudAdapter = {
  id: "gdrive",
  async ensureReady() {
    await getAccessToken();
  },
  async list(table) {
    const all = await listFilesByName();
    const wanted = all.filter((f) => {
      const p = parseDocFilename(f.name);
      return p && p.table === table;
    });
    const rows: DocRow[] = [];
    for (const f of wanted) {
      const p = parseDocFilename(f.name)!;
      try {
        const payload = (await downloadJson(f.id)) as { name?: string; data?: unknown };
        rows.push({
          id: p.id,
          name: payload?.name || "Unnamed",
          data: payload?.data ?? null,
          updated_at: f.modifiedTime || new Date().toISOString(),
        });
      } catch (e) {
        console.warn("gdrive read", f.name, e);
      }
    }
    rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return rows;
  },
  async save(table, id, name, data) {
    const docId = id ?? uuid();
    const filename = docFilename(table, docId);
    // Find existing
    const all = await listFilesByName();
    const existing = all.find((f) => f.name === filename);
    const payload = { name, data };
    const f = await uploadJson(existing?.id ?? null, filename, payload);
    return {
      id: docId,
      name,
      data,
      updated_at: f.modifiedTime || new Date().toISOString(),
    };
  },
  async remove(table, id) {
    const filename = docFilename(table, id);
    const all = await listFilesByName();
    const existing = all.find((f) => f.name === filename);
    if (!existing) return;
    const resp = await gfetch(`${API}/files/${existing.id}`, { method: "DELETE" });
    if (!resp.ok && resp.status !== 404)
      throw new Error("Drive delete fehlgeschlagen: " + (await resp.text()));
  },
};
