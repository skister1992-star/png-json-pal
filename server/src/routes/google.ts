import { Router } from "express";
import { db, newId } from "../db.js";
import { publicUser, setUserCookie, signUserToken, type UserRow } from "../auth.js";

export const googleRouter = Router();

type OAuthCfg = {
  google_client_id: string;
  google_client_secret: string;
  google_redirect_uri: string;
};

function getCfg(): OAuthCfg {
  return db
    .prepare(
      "SELECT google_client_id, google_client_secret, google_redirect_uri FROM oauth_config WHERE id = 1",
    )
    .get() as OAuthCfg;
}

// GET /api/auth/google/start?redirect=/somewhere
googleRouter.get("/start", (req, res) => {
  const cfg = getCfg();
  if (!cfg.google_client_id || !cfg.google_client_secret || !cfg.google_redirect_uri) {
    return res
      .status(503)
      .json({ error: "google_not_configured", message: "Admin must set Google OAuth credentials first." });
  }
  const state = newId();
  const finalRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
  res.cookie("cs_oauth_state", JSON.stringify({ state, redirect: finalRedirect }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });
  const params = new URLSearchParams({
    client_id: cfg.google_client_id,
    redirect_uri: cfg.google_redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// GET /api/auth/google/callback
googleRouter.get("/callback", async (req, res) => {
  const cfg = getCfg();
  const stateCookie = req.cookies?.cs_oauth_state;
  res.clearCookie("cs_oauth_state", { path: "/" });

  if (!stateCookie) return res.status(400).send("Missing state cookie");
  let parsedState: { state: string; redirect: string };
  try {
    parsedState = JSON.parse(stateCookie);
  } catch {
    return res.status(400).send("Bad state");
  }
  if (req.query.state !== parsedState.state) return res.status(400).send("State mismatch");
  const code = req.query.code;
  if (typeof code !== "string") return res.status(400).send("Missing code");

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.google_client_id,
        client_secret: cfg.google_client_secret,
        redirect_uri: cfg.google_redirect_uri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      console.error("[google] token exchange failed", t);
      return res.status(502).send("Google token exchange failed");
    }
    const tokens = (await tokenRes.json()) as { access_token: string; id_token: string };

    // Fetch userinfo
    const uiRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!uiRes.ok) return res.status(502).send("Failed to fetch Google userinfo");
    const ui = (await uiRes.json()) as {
      sub: string;
      email: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    // Find or create user
    let user = db.prepare("SELECT * FROM users WHERE google_sub = ?").get(ui.sub) as
      | UserRow
      | undefined;
    if (!user) {
      user = db.prepare("SELECT * FROM users WHERE email = ?").get(ui.email.toLowerCase()) as
        | UserRow
        | undefined;
      if (user) {
        db.prepare(
          `UPDATE users SET google_sub = ?, display_name = COALESCE(?, display_name),
             avatar_url = COALESCE(?, avatar_url), last_login_at = datetime('now')
           WHERE id = ?`,
        ).run(ui.sub, ui.name ?? null, ui.picture ?? null, user.id);
      } else {
        const id = newId();
        db.prepare(
          `INSERT INTO users (id, email, google_sub, display_name, avatar_url, last_login_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        ).run(id, ui.email.toLowerCase(), ui.sub, ui.name ?? null, ui.picture ?? null);
        user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
      }
    } else {
      db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
    }

    if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
      return res.status(403).send("Account is banned");
    }

    const token = signUserToken(user.id);
    setUserCookie(res, token);
    void publicUser; // keep import warning-free
    res.redirect(parsedState.redirect || "/");
  } catch (e) {
    console.error("[google] callback error", e);
    res.status(500).send("Google login failed");
  }
});
