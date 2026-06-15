# Character Studio – Self-Hosted Backend

Eigenständiger Node.js + SQLite Backend-Server, der **Supabase komplett ersetzt**.
Liefert Authentifizierung (Email/Passwort + Google), Admin-Bereich, OAuth-Konfiguration
und serviert das gebaute Frontend auf der gleichen Domain.

## Features

- ✅ Email/Passwort Registrierung & Login (bcrypt + JWT, HTTP-only Cookie)
- ✅ Google Sign-In (eigene OAuth Credentials — keine Lovable- oder Supabase-Abhängigkeit)
- ✅ Admin-Bereich (Default-Login `admin` / `root`)
- ✅ SQLite Datei-DB (`data/app.db`) — kein DB-Server nötig
- ✅ Liefert das Frontend (Vite-Build) auf der gleichen Domain (kein CORS-Stress)
- ✅ Alle Server-Daten (Accounts, Admin, OAuth-Config) liegen ausschließlich auf deinem Server
- ✅ User-Inhalte (Characters/Lorebooks/UserCards) bleiben im Browser-LocalStorage
  oder im verlinkten Google Drive — nichts davon landet auf dem Server

## Voraussetzungen

- **Node.js ≥ 20** (oder Bun ≥ 1.1)
- ca. 50 MB Speicherplatz für DB + Backups

## Setup

```bash
# 1) Frontend bauen (im Projekt-Root)
bun install
bun run build               # erzeugt ./dist/

# 2) Server vorbereiten
cd server
bun install                 # oder: npm install
cp .env.example .env

# 3) JWT-Secret erzeugen und in .env eintragen:
openssl rand -hex 32
# → in .env als JWT_SECRET=<output>

# 4) Server starten
bun run start               # oder: npm start
```

Server läuft jetzt auf `http://localhost:3000`. Frontend wird automatisch
mit ausgeliefert.

## Erster Login

1. App öffnen → unten rechts auf das Zahnrad (Admin-Einstellungen).
2. Admin-Passwort: `root`
3. Tab **„Passwort"** öffnen → neues sicheres Passwort setzen.
4. Tab **„Google"** öffnen → Client ID, Client Secret und Redirect URI eintragen
   (siehe nächster Abschnitt).

## Google OAuth einrichten

In der [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Authorized redirect URI:
   ```
   https://deine-domain.de/api/auth/google/callback
   ```
   (für lokales Testen zusätzlich: `http://localhost:3000/api/auth/google/callback`)
4. Erstellte **Client ID** und **Client Secret** im Admin-Bereich der App eintragen.

Sobald gespeichert, erscheint der „Mit Google fortfahren" Button automatisch auf der
Login-Seite.

## Datei-Layout

```
server/
├── data/app.db            # SQLite-Datei (automatisch angelegt)
├── src/
│   ├── index.ts           # Express + Static
│   ├── db.ts              # Schema + Seed (admin:root)
│   ├── auth.ts            # JWT, bcrypt, Middleware
│   └── routes/
│       ├── auth.ts        # /api/auth/{register,login,logout,me}
│       ├── google.ts      # /api/auth/google/{start,callback}
│       ├── admin.ts       # /api/admin/* (passwort, oauth, users)
│       └── config.ts      # /api/config (public)
└── .env                   # JWT_SECRET etc.
```

## Backup

Alles liegt in **einer** Datei: `server/data/app.db`. Backup =
diese Datei kopieren (am besten bei gestopptem Server oder per
`sqlite3 app.db ".backup backup.db"`).

## Produktion (mit Reverse Proxy)

Hinter Nginx / Caddy / Traefik mit HTTPS terminieren:

```nginx
# Nginx Beispiel
server {
  listen 443 ssl http2;
  server_name deine-domain.de;
  # ssl_certificate ...

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

Wichtig: `NODE_ENV=production` setzen, damit Cookies als `Secure` ausgeliefert werden.

```bash
NODE_ENV=production bun run start
```

## Daemonisieren (systemd)

`/etc/systemd/system/character-studio.service`:

```ini
[Unit]
Description=Character Studio
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/character-studio/server
EnvironmentFile=/opt/character-studio/server/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --experimental-strip-types src/index.ts
# Alternativ mit bun:
# ExecStart=/usr/local/bin/bun run start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now character-studio
```

## Frontend → Server Verbindung

Wenn Frontend und Server **auf der gleichen Domain** laufen (Standard-Setup),
musst du **nichts** konfigurieren — der Frontend Code spricht relative
`/api/*` URLs an.

Wenn du Frontend und Server auf **verschiedene Domains** legst, setze beim
Frontend-Build:

```bash
VITE_API_BASE_URL=https://api.deine-domain.de bun run build
```

## Sicherheitshinweise

- **JWT_SECRET** ist Pflicht und muss zufällig sein (`openssl rand -hex 32`). Niemals
  hartcodieren oder ins Git committen.
- Standard-Admin-Passwort (`root`) **sofort nach erstem Login ändern**.
- Hinter HTTPS betreiben (Cookies sind sonst über das Netzwerk lesbar).
- Google Client **Secret** ist serverseitig — verlässt den Server nie.
