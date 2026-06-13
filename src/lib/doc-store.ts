import { supabase } from "@/integrations/supabase/client";

type TableName = "lorebooks" | "user_cards";

export type DocRow = {
  id: string;
  name: string;
  data: unknown;
  updated_at: string;
};

export async function listDocs(table: TableName): Promise<DocRow[]> {
  const { data, error } = await supabase
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
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error("Nicht eingeloggt");
  if (id) {
    const { data: row, error } = await supabase
      .from(table)
      .update({ name, data: data as never })
      .eq("id", id)
      .select("id, name, data, updated_at")
      .single();
    if (error) throw error;
    return row as DocRow;
  }
  const { data: row, error } = await supabase
    .from(table)
    .insert({ user_id: user.id, name, data: data as never })
    .select("id, name, data, updated_at")
    .single();
  if (error) throw error;
  return row as DocRow;
}

export async function deleteDoc(table: TableName, id: string) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}
