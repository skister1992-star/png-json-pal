// WebDAV adapter (Nextcloud, ownCloud, generic WebDAV).
import {
  type CloudAdapter,
  type DocRow,
  type TableName,
  docFilename,
  parseDocFilename,
  uuid,
} from "./types";
import { getWebDAVConfig, type WebDAVConfig } from "@/lib/storage-mode";

function authHeader(cfg: WebDAVConfig) {
  return "Basic " + btoa(`${cfg.username}:${cfg.password}`);
}

function trimSlashes(s: string) {
  return s.replace(/^\/+|\/+$/g, "");
}

function folderUrl(cfg: WebDAVConfig) {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const folder = trimSlashes(cfg.folder || "st-cs");
  return `${base}/${folder}`;
}

function fileUrl(cfg: WebDAVConfig, filename: string) {
  return `${folderUrl(cfg)}/${encodeURIComponent(filename)}`;
}

async function ensureFolder(cfg: WebDAVConfig) {
  const url = folderUrl(cfg);
  // PROPFIND depth 0 to check existence
  const head = await fetch(url, {
    method: "PROPFIND",
    headers: { Authorization: authHeader(cfg), Depth: "0" },
  });
  if (head.ok || head.status === 207) return;
  if (head.status === 404) {
    const mk = await fetch(url, { method: "MKCOL", headers: { Authorization: authHeader(cfg) } });
    if (!mk.ok && mk.status !== 405)
      throw new Error("WebDAV MKCOL fehlgeschlagen: " + mk.status);
  } else {
    throw new Error("WebDAV PROPFIND fehlgeschlagen: " + head.status);
  }
}

type WebDAVEntry = { name: string; lastmod: string };

async function listFolder(cfg: WebDAVConfig): Promise<WebDAVEntry[]> {
  await ensureFolder(cfg);
  const url = folderUrl(cfg);
  const resp = await fetch(url, {
    method: "PROPFIND",
    headers: {
      Authorization: authHeader(cfg),
      Depth: "1",
      "Content-Type": "application/xml",
    },
    body:
      '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop>' +
      "<d:displayname/><d:getlastmodified/></d:prop></d:propfind>",
  });
  if (!resp.ok && resp.status !== 207)
    throw new Error("WebDAV list fehlgeschlagen: " + resp.status);
  const xml = await resp.text();
  const entries: WebDAVEntry[] = [];
  // Light parsing — extract <d:response> blocks
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const responses = doc.getElementsByTagNameNS("DAV:", "response");
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    const hrefEl = r.getElementsByTagNameNS("DAV:", "href")[0];
    if (!hrefEl?.textContent) continue;
    const href = decodeURIComponent(hrefEl.textContent);
    const name = href.split("/").filter(Boolean).pop() || "";
    if (!name || !parseDocFilename(name)) continue;
    const lm = r.getElementsByTagNameNS("DAV:", "getlastmodified")[0]?.textContent || "";
    entries.push({ name, lastmod: lm });
  }
  return entries;
}

async function downloadJson(cfg: WebDAVConfig, filename: string): Promise<unknown> {
  const resp = await fetch(fileUrl(cfg, filename), {
    headers: { Authorization: authHeader(cfg) },
  });
  if (!resp.ok) throw new Error("WebDAV download fehlgeschlagen: " + resp.status);
  return await resp.json();
}

async function uploadJson(cfg: WebDAVConfig, filename: string, payload: unknown) {
  await ensureFolder(cfg);
  const resp = await fetch(fileUrl(cfg, filename), {
    method: "PUT",
    headers: {
      Authorization: authHeader(cfg),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok && resp.status !== 201 && resp.status !== 204)
    throw new Error("WebDAV upload fehlgeschlagen: " + resp.status);
}

async function deleteFile(cfg: WebDAVConfig, filename: string) {
  const resp = await fetch(fileUrl(cfg, filename), {
    method: "DELETE",
    headers: { Authorization: authHeader(cfg) },
  });
  if (!resp.ok && resp.status !== 404 && resp.status !== 204)
    throw new Error("WebDAV delete fehlgeschlagen: " + resp.status);
}

export async function testWebDAVConnection(cfg: WebDAVConfig): Promise<void> {
  if (!cfg.baseUrl) throw new Error("Server-URL fehlt");
  if (!cfg.username) throw new Error("Benutzername fehlt");
  await ensureFolder(cfg);
}

export const webDavAdapter: CloudAdapter = {
  id: "webdav",
  async ensureReady() {
    const cfg = getWebDAVConfig();
    if (!cfg.baseUrl || !cfg.username) throw new Error("WebDAV nicht konfiguriert");
    await ensureFolder(cfg);
  },
  async list(table) {
    const cfg = getWebDAVConfig();
    const entries = await listFolder(cfg);
    const wanted = entries.filter((e) => {
      const p = parseDocFilename(e.name);
      return p && p.table === table;
    });
    const rows: DocRow[] = [];
    for (const e of wanted) {
      const p = parseDocFilename(e.name)!;
      try {
        const payload = (await downloadJson(cfg, e.name)) as { name?: string; data?: unknown };
        rows.push({
          id: p.id,
          name: payload?.name || "Unnamed",
          data: payload?.data ?? null,
          updated_at: e.lastmod || new Date().toISOString(),
        });
      } catch (err) {
        console.warn("webdav read", e.name, err);
      }
    }
    rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return rows;
  },
  async save(table, id, name, data) {
    const cfg = getWebDAVConfig();
    const docId = id ?? uuid();
    const filename = docFilename(table, docId);
    await uploadJson(cfg, filename, { name, data });
    return { id: docId, name, data, updated_at: new Date().toISOString() };
  },
  async remove(table, id) {
    const cfg = getWebDAVConfig();
    await deleteFile(cfg, docFilename(table, id));
  },
};
