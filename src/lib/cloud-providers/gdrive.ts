// Google Drive adapter — uses Google Identity Services (GIS) implicit token
// flow scoped ONLY to drive.appdata. No client_secret, no backend OAuth
// exchange, no PKCE/code flow. The Google client_id is a PUBLIC value taken
// from VITE_GOOGLE_CLIENT_ID. Authentication of the *user* is handled by
// Supabase — this module only obtains a Drive access token on demand to act
// as the storage layer.
import {
  type CloudAdapter,
  type DocRow,
  type TableName,
  docFilename,
  parseDocFilename,
  uuid,
} from "./types";
import { getStoredToken, isTokenValid, setStoredToken } from "./oauth";

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

// Folder names inside the hidden appDataFolder. Logical "/AppData/<folder>/".
const FOLDER_FOR_TABLE: Record<TableName, string> = {
  lorebooks: "lorebooks",
  user_cards: "usercards",
};

// ---------- Google Identity Services token client ----------

type TokenResponse = {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
};

type GisTokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};

type GisGlobal = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => GisTokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GisGlobal;
  }
}

function getClientId(): string {
  const id = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
  if (!id) {
    throw new Error(
      "VITE_GOOGLE_CLIENT_ID ist nicht gesetzt. Trage eine öffentliche Google OAuth Client-ID (Web) in die .env ein.",
    );
  }
  return id;
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("Google Identity Services konnte nicht geladen werden."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

async function requestNewAccessToken(prompt: "" | "consent" = ""): Promise<void> {
  const clientId = getClientId();
  await loadGis();
  await new Promise<void>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          return reject(new Error(resp.error_description || resp.error || "OAuth fehlgeschlagen"));
        }
        const expiresIn = Number(resp.expires_in) || 3600;
        setStoredToken("gdrive", {
          accessToken: resp.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          tokenType: "Bearer",
        });
        resolve();
      },
      error_callback: (err) =>
        reject(new Error(err?.message || "Google Drive Anmeldung abgebrochen")),
    });
    client.requestAccessToken(prompt ? { prompt } : undefined);
  });
}

async function getAccessToken(): Promise<string> {
  const tok = getStoredToken("gdrive");
  if (isTokenValid(tok)) return tok!.accessToken;
  throw new Error("Nicht mit Google Drive verbunden");
}

export async function connectGoogleDrive(): Promise<void> {
  await requestNewAccessToken("consent");
}

export function disconnectGoogleDrive() {
  setStoredToken("gdrive", null);
  folderIdCache = {};
}

// ---------- Drive REST helpers ----------

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

let folderIdCache: Record<string, string> = {};

async function ensureFolder(name: string): Promise<string> {
  if (folderIdCache[name]) return folderIdCache[name];
  const q = encodeURIComponent(
    `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'appDataFolder' in parents and trashed=false`,
  );
  const resp = await gfetch(
    `${API}/files?spaces=appDataFolder&fields=files(id,name)&pageSize=10&q=${q}`,
  );
  if (!resp.ok) throw new Error("Drive folder lookup fehlgeschlagen: " + (await resp.text()));
  const j = (await resp.json()) as { files: DriveFile[] };
  if (j.files?.[0]?.id) {
    folderIdCache[name] = j.files[0].id;
    return j.files[0].id;
  }
  // create
  const create = await gfetch(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["appDataFolder"],
    }),
  });
  if (!create.ok) throw new Error("Drive folder anlegen fehlgeschlagen: " + (await create.text()));
  const cj = (await create.json()) as { id: string };
  folderIdCache[name] = cj.id;
  return cj.id;
}

async function listFilesIn(folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
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
  parentId: string,
  payload: unknown,
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: filename };
  if (!fileId) metadata.parents = [parentId];

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

// ---------- Adapter ----------

export const googleDriveAdapter: CloudAdapter = {
  id: "gdrive",
  async ensureReady() {
    await getAccessToken();
  },
  async list(table) {
    const folderId = await ensureFolder(FOLDER_FOR_TABLE[table]);
    const files = await listFilesIn(folderId);
    const rows: DocRow[] = [];
    for (const f of files) {
      const p = parseDocFilename(f.name);
      if (!p || p.table !== table) continue;
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
    const folderId = await ensureFolder(FOLDER_FOR_TABLE[table]);
    const files = await listFilesIn(folderId);
    const existing = files.find((f) => f.name === filename);
    const payload = { name, data };
    const f = await uploadJson(existing?.id ?? null, filename, folderId, payload);
    return {
      id: docId,
      name,
      data,
      updated_at: f.modifiedTime || new Date().toISOString(),
    };
  },
  async remove(table, id) {
    const filename = docFilename(table, id);
    const folderId = await ensureFolder(FOLDER_FOR_TABLE[table]);
    const files = await listFilesIn(folderId);
    const existing = files.find((f) => f.name === filename);
    if (!existing) return;
    const resp = await gfetch(`${API}/files/${existing.id}`, { method: "DELETE" });
    if (!resp.ok && resp.status !== 404)
      throw new Error("Drive delete fehlgeschlagen: " + (await resp.text()));
  },
};
