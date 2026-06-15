import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error(
    "[auth] FATAL: JWT_SECRET environment variable is missing or too short. " +
      "Set it in your .env file (e.g. openssl rand -hex 32).",
  );
  process.exit(1);
}

const JWT_SECRET_SAFE: string = JWT_SECRET;
export const SESSION_COOKIE = "cs_session";
export const ADMIN_COOKIE = "cs_admin";
const USER_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const ADMIN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banned_until: string | null;
  created_at: string;
  last_login_at: string | null;
};

export function signUserToken(userId: string): string {
  return jwt.sign({ sub: userId, kind: "user" }, JWT_SECRET_SAFE, {
    expiresIn: USER_TTL_SECONDS,
  });
}

export function signAdminToken(): string {
  return jwt.sign({ kind: "admin" }, JWT_SECRET_SAFE, { expiresIn: ADMIN_TTL_SECONDS });
}

export function verifyToken(token: string): { sub?: string; kind?: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET_SAFE) as { sub?: string; kind?: string };
  } catch {
    return null;
  }
}

export function setUserCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: USER_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function setAdminCookie(res: Response, token: string) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearUserCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
export function clearAdminCookie(res: Response) {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
}

// ---- Middlewares ----

export interface AuthedRequest extends Request {
  user?: UserRow;
}

export function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  const payload = verifyToken(token);
  if (!payload || payload.kind !== "user" || !payload.sub) {
    return res.status(401).json({ error: "invalid_token" });
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.sub) as
    | UserRow
    | undefined;
  if (!user) return res.status(401).json({ error: "user_not_found" });
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    return res.status(403).json({ error: "banned" });
  }
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) return res.status(401).json({ error: "admin_required" });
  const payload = verifyToken(token);
  if (!payload || payload.kind !== "admin") {
    return res.status(401).json({ error: "invalid_admin_token" });
  }
  next();
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    banned_until: u.banned_until,
    provider: u.google_sub ? "google" : "email",
  };
}
