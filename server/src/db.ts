import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import bcrypt from "bcryptjs";

const DB_PATH = resolve(process.env.DB_PATH ?? "./data/app.db");
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ---------- Schema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT,                 -- null for OAuth-only accounts
    google_sub    TEXT UNIQUE,          -- Google "sub" claim if linked
    display_name  TEXT,
    avatar_url    TEXT,
    banned_until  TEXT,                 -- ISO date or null
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Google OAuth handled by Supabase Auth; no oauth_config table.

  CREATE TABLE IF NOT EXISTS password_resets (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
`);

// ---------- Seed defaults ----------

// Default admin password = "root" if no admin row yet.
const adminRow = db.prepare("SELECT id FROM admin_settings WHERE id = 1").get() as
  | { id: number }
  | undefined;
if (!adminRow) {
  const hash = bcrypt.hashSync("root", 10);
  db.prepare("INSERT INTO admin_settings (id, password_hash) VALUES (1, ?)").run(hash);
  console.log("[db] Seeded default admin password: 'root' (please change it after first login)");
}

// Default oauth_config row.
const oauthRow = db.prepare("SELECT id FROM oauth_config WHERE id = 1").get();
if (!oauthRow) {
  db.prepare(
    `INSERT INTO oauth_config (id, google_client_id, google_client_secret, google_redirect_uri)
     VALUES (1, ?, ?, ?)`,
  ).run(
    process.env.GOOGLE_CLIENT_ID ?? "",
    process.env.GOOGLE_CLIENT_SECRET ?? "",
    process.env.GOOGLE_REDIRECT_URI ?? "",
  );
}

// ---------- Helpers ----------
export function newId(): string {
  // Crypto-random hex id (16 bytes => 32 chars), enough for users.
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}
