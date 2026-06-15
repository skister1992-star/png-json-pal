## Teil 1 – Speichermodus erst nach erfolgreicher Verbindung

**Datei: `src/components/UserStorageSettings.tsx`**

- `selected` (UI-Auswahl) wird vom aktiven `mode` (`getStorageMode()`) getrennt. Radio-Klick ändert nur `selected`, nicht den aktiven Modus.
- Das aktive Radio bekommt ein Badge „aktiv".
- Neuer Button „Als Speicherort verwenden" pro Zeile. Gate je Modus:
  | Modus | Aktivierbar wenn |
  |---|---|
  | `local` | immer |
  | `gdrive` / `onedrive` / `dropbox` | `isTokenValid(getStoredToken(p))` |
  | `webdav` | `testWebDAVConnection(dav)` ist ok |
  | `custom` | `testCustom()` ist ok (Ergebnis im State `customVerified` merken) |
- Button disabled mit Hinweis: „Erst verbinden" / „Erst Verbindung testen". Erst nach Klick → `setStorageMode(p)`.
- Für WebDAV und „Eigene Supabase-Cloud": existierender „Speichern"-Button wird zu „Verbinden & aktivieren" – speichert Config, testet, setzt bei Erfolg Mode; Fehler → Toast, Mode unverändert.
- Wenn der aktive Modus durch Trennen/Config-Löschen ungültig wird → automatisch zurück auf `local` mit Toast.

**Datei: `src/lib/cloud-providers/webdav.ts`**

- Neue Funktion `testWebDAVConnection(cfg: WebDAVConfig): Promise<void>` → `PROPFIND Depth:0` auf `${baseUrl}/${folder}/`; bei 404 `MKCOL` anlegen; bei Fehler werfen.

## Teil 2 – Admin-Bereich auch beim Self-Hosting nutzbar

Hintergrund: Admin-Login läuft über Server-Functions, die `supabaseAdmin` mit `SUPABASE_SERVICE_ROLE_KEY` benutzen. Auf einem fremden Server funktioniert das nur, wenn diese Env-Variablen gesetzt sind. Der Zahnrad-Button wird im Root-Layout immer gerendert, ist also überall sichtbar.

**Datei: `src/components/AdminSettings.tsx`**

- Im bestehenden Tab „Self-Hosting" (bzw. Konfig-Tab) eine klar erkennbare Box mit den **erforderlichen Server-Env-Variablen für den Export** ergänzen, jeweils mit Copy-Button:
  ```
  SUPABASE_URL=…
  SUPABASE_PUBLISHABLE_KEY=…
  SUPABASE_SERVICE_ROLE_KEY=…   (für Admin-Login + User-Verwaltung)
  VITE_SUPABASE_URL=…
  VITE_SUPABASE_PUBLISHABLE_KEY=…
  VITE_SUPABASE_PROJECT_ID=…
  ```
  Plus Hinweistext: „Ohne `SUPABASE_SERVICE_ROLE_KEY` auf dem Zielserver ist der Admin-Login dort nicht möglich."
- Neuer Diagnose-Button „Server-Verbindung prüfen" → ruft eine neue, **unauthentifizierte** Server-Function `adminEnvCheck` (gibt nur Booleans zurück, keine Werte) und zeigt:
  - `hasUrl`, `hasPublishableKey`, `hasServiceRole` – grün/rot pro Variable.
- Login-Fehlertext erweitern: wenn Server-Function einen Env-Fehler wirft, freundlicher Hinweis mit Link zur Self-Hosting-Doku-Box.

**Datei: `src/lib/admin.functions.ts`**

- Neue Function `adminEnvCheck` (kein Token nötig, gibt nichts Sensibles zurück):
  ```ts
  export const adminEnvCheck = createServerFn({ method: "GET" })
    .handler(async () => ({
      hasUrl: !!process.env.SUPABASE_URL,
      hasPublishableKey: !!process.env.SUPABASE_PUBLISHABLE_KEY,
      hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    }));
  ```
- Bestehende `verifyToken`/`adminLogin` bekommen einen klareren Fehlertext, falls `supabaseAdmin` mangels Env nicht initialisiert werden kann (try/catch um den Import + sprechender Fehler „Server-Konfiguration unvollständig (SUPABASE_SERVICE_ROLE_KEY fehlt)").

## Nicht geändert

- DB-Schema, OAuth-Flow, Cloud-Adapter-API, `doc-store.ts`, `__root.tsx`-Buttons.
- Keine neuen Geheimnisse im Client; `adminEnvCheck` liefert nur Booleans.
