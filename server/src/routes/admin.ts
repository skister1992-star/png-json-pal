import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "../db.js";
import {
  clearAdminCookie,
  publicUser,
  requireAdmin,
  setAdminCookie,
  signAdminToken,
  type UserRow,
} from "../auth.js";

export const adminRouter = Router();

// POST /api/admin/login { password }
adminRouter.post("/login", (req, res) => {
  const password = String(req.body?.password ?? "");
  if (!password) return res.status(400).json({ error: "invalid_input" });
  const row = db.prepare("SELECT password_hash FROM admin_settings WHERE id = 1").get() as
    | { password_hash: string }
    | undefined;
  if (!row) return res.status(500).json({ error: "admin_not_seeded" });
  if (!bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "invalid_password" });
  }
  const token = signAdminToken();
  setAdminCookie(res, token);
  res.json({ ok: true });
});

// POST /api/admin/logout
adminRouter.post("/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

// GET /api/admin/me
adminRouter.get("/me", requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

// PUT /api/admin/password { newPassword }
adminRouter.put("/password", requireAdmin, (req, res) => {
  const np = String(req.body?.newPassword ?? "");
  if (np.length < 4) return res.status(400).json({ error: "password_too_short" });
  const hash = bcrypt.hashSync(np, 10);
  db.prepare(
    "UPDATE admin_settings SET password_hash = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(hash);
  res.json({ ok: true });
});

// ---- OAuth config ----

const oauthSchema = z.object({
  google_client_id: z.string().max(500),
  google_client_secret: z.string().max(500),
  google_redirect_uri: z.string().max(500),
});

adminRouter.get("/oauth", requireAdmin, (_req, res) => {
  const row = db
    .prepare(
      "SELECT google_client_id, google_client_secret, google_redirect_uri FROM oauth_config WHERE id = 1",
    )
    .get();
  res.json(row);
});

adminRouter.put("/oauth", requireAdmin, (req, res) => {
  const parsed = oauthSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  db.prepare(
    `UPDATE oauth_config SET google_client_id = ?, google_client_secret = ?,
       google_redirect_uri = ?, updated_at = datetime('now') WHERE id = 1`,
  ).run(
    parsed.data.google_client_id,
    parsed.data.google_client_secret,
    parsed.data.google_redirect_uri,
  );
  res.json({ ok: true });
});

// ---- Users management ----

adminRouter.get("/users", requireAdmin, (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM users ORDER BY created_at DESC LIMIT 500")
    .all() as UserRow[];
  res.json(rows.map(publicUser));
});

adminRouter.get("/users/:id", requireAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as
    | UserRow
    | undefined;
  if (!u) return res.status(404).json({ error: "not_found" });
  res.json({ user: publicUser(u) });
});

adminRouter.delete("/users/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

adminRouter.post("/users/:id/ban", requireAdmin, (req, res) => {
  const ban = !!req.body?.ban;
  if (ban) {
    const until = new Date(Date.now() + 100 * 365 * 24 * 3600 * 1000).toISOString();
    db.prepare("UPDATE users SET banned_until = ? WHERE id = ?").run(until, req.params.id);
  } else {
    db.prepare("UPDATE users SET banned_until = NULL WHERE id = ?").run(req.params.id);
  }
  res.json({ ok: true });
});
