import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, newId } from "../db.js";
import {
  clearUserCookie,
  publicUser,
  requireUser,
  setUserCookie,
  signUserToken,
  type AuthedRequest,
  type UserRow,
} from "../auth.js";

export const authRouter = Router();

const credSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(200),
});

// POST /api/auth/register
authRouter.post("/register", (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { email, password } = parsed.data;
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: "email_taken" });

  const id = newId();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, last_login_at)
     VALUES (?, ?, ?, datetime('now'))`,
  ).run(id, email.toLowerCase(), hash);

  const token = signUserToken(id);
  setUserCookie(res, token);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
  res.json({ user: publicUser(user) });
});

// POST /api/auth/login
authRouter.post("/login", (req, res) => {
  const parsed = credSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_input" });
  const { email, password } = parsed.data;
  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase()) as UserRow | undefined;
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    return res.status(403).json({ error: "banned" });
  }
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  const token = signUserToken(user.id);
  setUserCookie(res, token);
  res.json({ user: publicUser(user) });
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => {
  clearUserCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
authRouter.get("/me", requireUser, (req: AuthedRequest, res) => {
  res.json({ user: publicUser(req.user!) });
});
