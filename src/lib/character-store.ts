import { supabase } from "@/integrations/supabase/client";

export type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  data: any;
  image_path: string | null;
  created_at: string;
  updated_at: string;
};

const BUCKET = "character-images";

export async function listCharacters(): Promise<CharacterRow[]> {
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as CharacterRow[];
}

export async function uploadImage(userId: string, charId: string, png: Uint8Array): Promise<string> {
  const path = `${userId}/${charId}.png`;
  const blob = new Blob([png as BlobPart], { type: "image/png" });
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: "image/png",
  });
  if (error) throw error;
  return path;
}

export async function downloadImage(path: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

export async function getSignedImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveCharacter(opts: {
  id?: string;
  name: string;
  data: any;
  png?: Uint8Array | null;
}): Promise<CharacterRow> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error("Not signed in");

  let id = opts.id;
  let image_path: string | null = null;

  if (!id) {
    const { data, error } = await supabase
      .from("characters")
      .insert({ user_id: user.id, name: opts.name, data: opts.data })
      .select()
      .single();
    if (error) throw error;
    id = data.id;
  }

  if (opts.png) {
    image_path = await uploadImage(user.id, id!, opts.png);
  }

  const update: any = { name: opts.name, data: opts.data };
  if (image_path) update.image_path = image_path;

  const { data, error } = await supabase
    .from("characters")
    .update(update)
    .eq("id", id!)
    .select()
    .single();
  if (error) throw error;
  return data as CharacterRow;
}

export async function deleteCharacter(row: CharacterRow): Promise<void> {
  if (row.image_path) {
    await supabase.storage.from(BUCKET).remove([row.image_path]);
  }
  const { error } = await supabase.from("characters").delete().eq("id", row.id);
  if (error) throw error;
}
