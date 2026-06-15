# Self-Hosting Quickstart

Diese App läuft komplett ohne Supabase auf deinem eigenen Server. Backend:
Node.js + SQLite (siehe `server/`).

## Schnellstart auf deinem Server

```bash
# 1) Frontend bauen
bun install
bun run build

# 2) Backend installieren & konfigurieren
cd server
bun install
cp .env.example .env
# .env öffnen, JWT_SECRET setzen: openssl rand -hex 32

# 3) Starten
bun run start
# → http://localhost:3000
```

Standard-Admin-Login: `root` (im Admin-Zahnrad ändern!).

Vollständige Anleitung inkl. Google OAuth, Nginx-Setup und systemd:
**[`server/README.md`](./server/README.md)**

## Was wo gespeichert wird

| Datenart | Wo |
|---|---|
| Accounts, Admin-Passwort, Google-OAuth-Config | SQLite auf deinem Server (`server/data/app.db`) |
| User-Inhalte (Characters, Lorebooks, UserCards) | Browser-LocalStorage **oder** verlinkter Google Drive des Users |

User-Inhalte landen **niemals** auf dem Server.

## Frontend-Hinweis

Der vorhandene Frontend-Code spricht aktuell noch Supabase an
(`src/integrations/supabase/`). Nach dem Export auf deinen Server musst du
die Auth- und Storage-Aufrufe schrittweise auf den neuen Client umstellen:

```ts
import { api } from "@/lib/api-client";

// Login per Email/Passwort
await api.login(email, password);

// Login per Google
api.loginWithGoogle();

// Aktueller User
const me = await api.me();
```

Siehe `src/lib/api-client.ts` für alle verfügbaren Endpunkte.
