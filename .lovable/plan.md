# Komplett-Umbau: Self-Hosted Backend ohne Supabase

## Ziel
- **Kein Supabase mehr.** Eigenes Node.js + SQLite Backend, das auf deinem Server läuft.
- **Auth:** Email/Passwort (bcrypt + JWT) **und** Google Login (eigene Google OAuth Credentials).
- **Daten-Trennung:**
  - **Server-Daten** (Accounts, Admin-Settings, OAuth-Config) → SQLite auf deinem Server.
  - **User-Inhalte** (Characters, Lorebooks, User Cards) → Browser-LocalStorage **oder** Google Drive, wenn der User sein Drive verbindet. **Nichts** davon liegt auf dem Server.

## Wichtige Einschränkung der Lovable-Vorschau
Die Lovable-Preview läuft auf Cloudflare Workers (kein Dateisystem, kein SQLite). Das neue Backend kann **nur auf deinem eigenen Server** laufen.
- In der Lovable-Preview wird das Frontend automatisch in einen **„Demo-Modus"** fallen: kein Login, alles im LocalStorage. So bleibt die Preview benutzbar zum Designen/Testen.
- Sobald du exportierst und den Server startest, ist alles voll funktional (Login, Admin, Multi-User).

## Was gebaut wird

### 1. Neues `server/` Verzeichnis (Node.js + Express + SQLite)
```text
server/
├── package.json          # eigene deps: express, better-sqlite3, bcrypt, jsonwebtoken, zod
├── README.md             # Self-Hosting Anleitung
├── .env.example          # PORT, JWT_SECRET, ADMIN_PASSWORD, GOOGLE_CLIENT_ID/SECRET
├── src/
│   ├── index.ts          # Express server + statisches Frontend ausliefern
│   ├── db.ts             # SQLite Schema (users, sessions, admin_settings, oauth_config)
│   ├── auth.ts           # bcrypt, JWT, Middleware
│   ├── routes/
│   │   ├── auth.ts       # POST /api/auth/register, /login, /logout, /me
│   │   ├── google.ts     # GET /api/auth/google/start, /callback
│   │   ├── admin.ts      # POST /api/admin/login, GET/PUT /api/admin/settings
│   │   └── config.ts     # GET /api/config (public: google_client_id für Drive-OAuth)
│   └── migrations.ts     # auto-run bei Start, erstellt admin:root falls leer
```

Standard-Admin: `admin` / `root` wird beim ersten Start automatisch erzeugt.

### 2. Frontend-Umbau
- **Entfernen:** `src/integrations/supabase/*`, `supabase/migrations/*`, alle `*.functions.ts` (createServerFn), alle Supabase-Imports.
- **Neu:** `src/lib/api-client.ts` — fetch-Wrapper gegen `VITE_API_BASE_URL` (Demo-Modus wenn nicht gesetzt).
- **Neu:** `src/lib/auth-context.tsx` — JWT im LocalStorage, `useAuth()` Hook.
- **Routen:** `/auth` (Email/Passwort + „Sign in with Google" Button), `_authenticated/` Layout.
- **Bestehende Stores** (`character-store.ts`, `lorebook.ts`, `user-cards`) bleiben **LocalStorage-basiert** und bekommen optionale Google-Drive-Sync (bereits teilweise vorhanden in `src/lib/cloud-providers/`).
- **AdminSettings.tsx** & **UserStorageSettings.tsx** sprechen das neue Backend an.

### 3. Google Auth (eigene Credentials)
Im Admin-Bereich trägt der Self-Host-Betreiber ein:
- Google Client ID
- Google Client Secret
- Redirect URI (z.B. `https://meinedomain.tld/api/auth/google/callback`)

Wird in `oauth_config` Tabelle gespeichert. Frontend holt die Client-ID via `/api/config` und startet OAuth.

### 4. Cleanup
- `supabase/` Ordner löschen.
- `.env` aufräumen (nur noch `VITE_API_BASE_URL`).
- `src/integrations/supabase/` löschen.
- `src/lib/admin.functions.ts` löschen.
- `package.json`: Supabase-Deps raus.

## Technisches im Detail

**Backend-Stack im `server/`:**
- `express` + `cookie-parser`
- `better-sqlite3` (synchron, simpel, eine `.db`-Datei)
- `bcryptjs` für Passwörter
- `jsonwebtoken` für Sessions (HTTP-only Cookie, 7 Tage)
- `zod` für Input-Validierung
- Liefert das gebaute Frontend (`dist/`) als statische Dateien aus → **alles unter einer Domain**, kein CORS-Setup nötig.

**Frontend ↔ Backend Kommunikation:**
- Same-origin: alle `/api/*` Calls.
- JWT im `httpOnly` Cookie → automatisch mit jedem Request gesendet.
- Routen-Guard via `beforeLoad` in `_authenticated/route.tsx`: ruft `/api/auth/me`, redirect zu `/auth` bei 401.

**Self-Hosting Workflow (in `server/README.md`):**
```bash
# 1. Frontend bauen
bun install && bun run build

# 2. Server starten
cd server && bun install
cp .env.example .env   # JWT_SECRET setzen!
bun run start          # läuft auf PORT (default 3000)
```

## Reihenfolge der Umsetzung
1. `server/` komplett bauen (Node + SQLite + Auth + Google OAuth + Admin).
2. Frontend `api-client.ts` + `auth-context.tsx` + `/auth` Route.
3. Demo-Modus-Fallback für die Lovable-Preview.
4. Supabase überall entfernen, alte Files löschen.
5. README mit Setup-Anleitung.

## Was du NACH dem Export tun musst
1. `git clone` / Export herunterladen.
2. Frontend bauen (`bun run build`).
3. In `server/` einmal `.env` ausfüllen (JWT_SECRET mit z.B. `openssl rand -hex 32`).
4. Server starten.
5. Mit `admin` / `root` im Admin-Bereich einloggen → Google Client ID/Secret eintragen.
6. Fertig.

## Bestätigung
Soll ich es genauso umsetzen? Das ist umfangreich (~20-30 Dateien neu/gelöscht) und nach dem Umbau wird die Lovable-Preview den Login-Flow **nicht** mehr live demonstrieren können — sie zeigt nur das UI im Demo-Modus. Voll funktional wird's erst auf deinem Server.