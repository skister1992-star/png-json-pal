import { createServerFn } from "@tanstack/react-start";

const SESSION_TTL_HOURS = 24;

function randomToken() {
  // 32-byte random token in hex
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadAdmin() {
  try {
    const mod = await import("@/integrations/supabase/client.server");
    return mod.supabaseAdmin;
  } catch (e) {
    throw new Error(
      "Server-Konfiguration unvollständig: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen auf dem Server gesetzt sein. " +
        (e instanceof Error ? `(${e.message})` : ""),
    );
  }
}

async function verifyToken(token: string) {
  if (!token) throw new Error("Kein Admin-Token");
  const supabaseAdmin = await loadAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("token, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ungültiges Admin-Token");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("admin_sessions").delete().eq("token", token);
    throw new Error("Admin-Sitzung abgelaufen");
  }
  return supabaseAdmin;
}

// ---------- Server env diagnostic (no secrets returned) ----------
export const adminEnvCheck = createServerFn({ method: "GET" }).handler(async () => ({
  hasUrl: !!process.env.SUPABASE_URL,
  hasPublishableKey: !!process.env.SUPABASE_PUBLISHABLE_KEY,
  hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
}));

// ---------- Login ----------
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { password: string }) => d)
  .handler(async ({ data }) => {
    const supabaseAdmin = await loadAdmin();
    // Verify password using pgcrypto crypt() comparison
    const { data: row, error } = await supabaseAdmin.rpc("admin_verify_password", {
      _password: data.password,
    });
    if (error) {
      // Fallback: do verification inline via raw SQL through a query
      throw error;
    }
    if (!row) throw new Error("Falsches Passwort");
    const token = randomToken();
    const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();
    const { error: e2 } = await supabaseAdmin
      .from("admin_sessions")
      .insert({ token, expires_at: expires });
    if (e2) throw e2;
    return { token, expires_at: expires };
  });

// ---------- Logout ----------
export const adminLogout = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const supabaseAdmin = await loadAdmin();
    await supabaseAdmin.from("admin_sessions").delete().eq("token", data.token);
    return { ok: true };
  });

// ---------- Change admin password ----------
export const adminChangePassword = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; newPassword: string }) => d)
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    if (!data.newPassword || data.newPassword.length < 6)
      throw new Error("Passwort zu kurz (mind. 6 Zeichen)");
    const { error } = await admin.rpc("admin_set_password", {
      _new_password: data.newPassword,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------- List users ----------
export const adminListUsers = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    const { data: page, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw error;
    return page.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? null,
      banned_until:
        (u as unknown as { banned_until?: string | null }).banned_until ?? null,
      provider: u.app_metadata?.provider ?? "email",
    }));
  });

// ---------- Get user details ----------
export const adminGetUser = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    const { data: u, error } = await admin.auth.admin.getUserById(data.userId);
    if (error) throw error;
    const [chars, lore, cards] = await Promise.all([
      admin.from("characters").select("id, name, updated_at").eq("user_id", data.userId),
      admin.from("lorebooks").select("id, name, updated_at").eq("user_id", data.userId),
      admin.from("user_cards").select("id, name, updated_at").eq("user_id", data.userId),
    ]);
    return {
      user: u.user,
      characters: chars.data ?? [],
      lorebooks: lore.data ?? [],
      user_cards: cards.data ?? [],
    };
  });

// ---------- Delete user ----------
export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    const { error } = await admin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Ban / Unban ----------
export const adminBanUser = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; userId: string; ban: boolean }) => d)
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "876000h" : "none", // ~100 years or unban
    } as never);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Send password reset email ----------
export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; email: string; redirectTo?: string }) => d)
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    const { error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
      options: data.redirectTo ? { redirectTo: data.redirectTo } : undefined,
    });
    if (error) throw error;
    return { ok: true };
  });

// ---------- OAuth app config (Google/MS/Dropbox client IDs) ----------
export const adminSetOAuthConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      token: string;
      google_client_id: string;
      microsoft_client_id: string;
      microsoft_tenant: string;
      dropbox_app_key: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const admin = await verifyToken(data.token);
    const { error } = await admin
      .from("oauth_app_config")
      .update({
        google_client_id: data.google_client_id,
        microsoft_client_id: data.microsoft_client_id,
        microsoft_tenant: data.microsoft_tenant || "common",
        dropbox_app_key: data.dropbox_app_key,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw error;
    return { ok: true };
  });
