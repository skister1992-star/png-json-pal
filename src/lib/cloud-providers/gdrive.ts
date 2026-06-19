// Google Drive adapter — uses the Google OAuth access token issued by
// Supabase Auth (provider_token from the user's Supabase session).
//
// Authentication is handled exclusively by Supabase Google OAuth. No GIS
// popup, no separate Google sign-in, no client_secret, no manual token
// exchange. The Supabase Google provider must be configured with the
// `https://www.googleapis.com/auth/drive.appdata` scope (we request it at
// signInWithOAuth time in src/lib/api-client.ts).

import {
  type CloudAdapter,
  type DocRow,
  type TableName,
  docFilename,
  parseDocFilename,
  uuid,
} from "./types";
import { supabase } from "@/integrations/supabase/client";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

const FOLDER_FOR_TABLE: Record<TableName, string> = {
  lorebooks: "lorebooks",
  user_cards: "usercards",
};

// ---------- Token from Supabase session ----------

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Supabase Session konnte nicht gelesen werden: " + error.message);
  const session = data.session;
  if (!session) {
    throw new Error("Nicht eingeloggt. Bitte mit Google über Supabase anmelden.");
  }
  const token = session.provider_token;
  if (!token) {
    throw new Error(
      "Kein Google OAuth Token vorhanden. Bitte einmal abmelden und erneut mit Google anmelden (Scope drive.appdata).",
    );
  }
  return token;
}

/**
 * Re-runs Supabase Google OAuth so the user grants the drive.appdata scope.
 * After redirect, the session contains a fresh provider_token.
 */
export async function connectGoogleDrive(): Promise<void> {
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: "https://www.googleapis.com/auth/drive.appdata",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
  if (error) throw new Error(error.message);
}

/**
 * "Disconnecting" Google Drive without breaking Supabase auth means signing
 * out of the Supabase session (which also drops the provider_token). The
 * user can re-login via Google any time.
 */
export async function disconnectGoogleDrive(): Promise<void> {
  await supabase.auth.signOut();
  folderIdCache = {};
}

// ---------- Drive REST helpers ----------

async function gfetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(path, { ...init, headers });
  if (resp.status === 401) {
    throw new Error(
      "Google Drive Token abgelaufen — bitte abmelden und erneut mit Google einloggen.",
    );
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
