// Public client-safe accessors for OAuth app config (Microsoft / Dropbox).
// Google is NOT included — Google Drive uses VITE_GOOGLE_CLIENT_ID from the
// frontend env and Google Identity Services; no DB lookup is needed.
import { supabase } from "@/integrations/supabase/client";

export type OAuthAppConfig = {
  microsoft_client_id: string;
  microsoft_tenant: string;
  dropbox_app_key: string;
};

const EMPTY: OAuthAppConfig = {
  microsoft_client_id: "",
  microsoft_tenant: "common",
  dropbox_app_key: "",
};

let cached: OAuthAppConfig | null = null;

export async function loadOAuthAppConfig(force = false): Promise<OAuthAppConfig> {
  if (cached && !force) return cached;
  const { data, error } = await supabase
    .from("oauth_app_config")
    .select("microsoft_client_id, microsoft_tenant, dropbox_app_key")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.warn("oauth_app_config load failed", error);
    return EMPTY;
  }
  cached = { ...EMPTY, ...(data ?? {}) };
  return cached;
}

export function invalidateOAuthAppConfigCache() {
  cached = null;
}
