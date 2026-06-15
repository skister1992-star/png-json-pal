import { supabase } from "@/integrations/supabase/client";
import { getStorageMode } from "./storage-mode";
import { getCustomSupabase } from "./custom-supabase";
import { getCloudAdapter } from "./cloud-providers";

type TableName = "lorebooks" | "user_cards";

export type DocRow = {
  id: string;
  name: string;
  data: unknown;
  updated_at: string;
};

// ---------- Local (browser) backend ----------
const LOCAL_PREFIX = "localdocs_v1:";
const lkey = (t: TableName) => LOCAL_PREFIX + t;

function readLocal(table: TableName): DocRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(lkey(table));
    return raw ? (JSON.parse(raw) as DocRow[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(table: TableName, rows: DocRow[]) {
  localStorage.setItem(lkey(table), JSON.stringify(rows));
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "loc_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function activeSupabase() {
  const mode = getStorageMode();
  if (mode === "custom") return await getCustomSupabase();
  return supabase;
}

// ---------- Public API ----------
export async function listDocs(table: TableName): Promise<DocRow[]> {
  const mode = getStorageMode();
  if (mode === "local") {
    return readLocal(table).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }
  const adapter = getCloudAdapter(mode);
  if (adapter) return adapter.list(table);

  const client = await activeSupabase();
  const { data, error } = await client
    .from(table)
    .select("id, name, data, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocRow[];
}

export async function saveDoc(
  table: TableName,
  id: string | null,
  name: string,
  data: unknown,
): Promise<DocRow> {
  const mode = getStorageMode();
  if (mode === "local") {
    const rows = readLocal(table);
    const now = new Date().toISOString();
    if (id) {
      const idx = rows.findIndex((r) => r.id === id);
      const row: DocRow = { id, name, data, updated_at: now };
      if (idx >= 0) rows[idx] = row;
      else rows.push(row);
      writeLocal(table, rows);
      return row;
    }
    const row: DocRow = { id: uuid(), name, data, updated_at: now };
    rows.push(row);
    writeLocal(table, rows);
    return row;
  }

  const adapter = getCloudAdapter(mode);
  if (adapter) return adapter.save(table, id, name, data);

  const client = await activeSupabase();
  const { data: userRes } = await client.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error("Nicht eingeloggt");
  if (id) {
    const { data: row, error } = await client
      .from(table)
      .update({ name, data: data as never })
      .eq("id", id)
      .select("id, name, data, updated_at")
      .single();
    if (error) throw error;
    return row as DocRow;
  }
  const { data: row, error } = await client
    .from(table)
    .insert({ user_id: user.id, name, data: data as never })
    .select("id, name, data, updated_at")
    .single();
  if (error) throw error;
  return row as DocRow;
}

export async function deleteDoc(table: TableName, id: string) {
  const mode = getStorageMode();
  if (mode === "local") {
    writeLocal(table, readLocal(table).filter((r) => r.id !== id));
    return;
  }
  const adapter = getCloudAdapter(mode);
  if (adapter) return adapter.remove(table, id);

  const client = await activeSupabase();
  const { error } = await client.from(table).delete().eq("id", id);
  if (error) throw error;
}
