// Server adapter — stores user docs in the Lovable Cloud (Supabase) database
// using the lorebooks / user_cards tables. Access is gated by RLS: only
// users with the 'approved' or 'admin' role can read/write their own rows.

import { supabase } from "@/integrations/supabase/client";
import type { CloudAdapter, DocRow, TableName } from "./types";

async function requireUser(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Nicht eingeloggt.");
  return data.user.id;
}

export const serverAdapter: CloudAdapter = {
  id: "server",
  async ensureReady() {
    await requireUser();
    const roles = await getMyRoles();
    if (!roles.includes("approved") && !roles.includes("admin")) {
      throw new Error(
        'Dein Konto ist noch nicht für die Server-Speicherung freigegeben. Bitte den Admin um die Rolle "approved".',
      );
    }
  },
  async list(table) {
    const { data, error } = await supabase
      .from(table)
      .select("id,name,data,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DocRow[];
  },
  async save(table, id, name, data) {
    const userId = await requireUser();
    if (id) {
      const { data: row, error } = await supabase
        .from(table)
        .update({ name, data: data as never })
        .eq("id", id)
        .select("id,name,data,updated_at")
        .single();
      if (error) throw new Error(error.message);
      return row as DocRow;
    }
    const { data: row, error } = await supabase
      .from(table)
      .insert({ name, data: data as never, user_id: userId })
      .select("id,name,data,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row as DocRow;
  },
  async remove(table, id) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

// ---------- Roles helper ----------

export type AppRole = "admin" | "approved" | "user";

export async function getMyRoles(): Promise<AppRole[]> {
  const { data, error } = await supabase.rpc("my_roles");
  if (error) {
    console.warn("my_roles failed", error);
    return [];
  }
  return (data ?? []) as AppRole[];
}
