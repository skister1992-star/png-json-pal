import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCustomCloudConfig } from "./storage-mode";

let cached: { url: string; anonKey: string; email: string; client: SupabaseClient } | null = null;

export async function getCustomSupabase(): Promise<SupabaseClient> {
  const cfg = getCustomCloudConfig();
  if (!cfg.url || !cfg.anonKey || !cfg.email || !cfg.password) {
    throw new Error("Eigene Cloud ist nicht vollständig konfiguriert.");
  }
  if (
    !cached ||
    cached.url !== cfg.url ||
    cached.anonKey !== cfg.anonKey ||
    cached.email !== cfg.email
  ) {
    const client = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: "sb-custom-cloud-auth",
      },
    });
    cached = { url: cfg.url, anonKey: cfg.anonKey, email: cfg.email, client };
  }
  const { data: sess } = await cached.client.auth.getSession();
  if (!sess.session) {
    const { error } = await cached.client.auth.signInWithPassword({
      email: cfg.email,
      password: cfg.password,
    });
    if (error) throw new Error("Anmeldung an eigener Cloud fehlgeschlagen: " + error.message);
  }
  return cached.client;
}

export function clearCustomSupabaseCache() {
  cached = null;
}
