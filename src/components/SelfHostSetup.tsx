import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, FileText, Terminal, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Cfg = {
  domain: string;
  port: string;
  jwtSecret: string;
  dbPath: string;
  frontendDist: string;
  adminPassword: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  appUser: string;
  appDir: string;
  nodeBin: string;
  // Cloudflare Tunnel (lokales Netz → Internet ohne offene Ports)
  useTunnel: boolean;
  tunnelName: string;
  tunnelToken: string;
  tunnelId: string;
  tunnelCredFile: string;
  localBindHost: string; // 127.0.0.1 wenn nur Tunnel, 0.0.0.0 sonst
};

function randomHex(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} kopiert`),
    () => toast.error("Kopieren fehlgeschlagen"),
  );
}

const STORAGE_KEY = "selfhost-setup-cfg-v1";

function detectDomain(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

function defaultCfg(): Cfg {
  const domain = detectDomain();
  return {
    domain,
    port: "3000",
    jwtSecret: randomHex(32),
    dbPath: "./data/app.db",
    frontendDist: "../dist",
    adminPassword: "root",
    googleClientId: "",
    googleClientSecret: "",
    googleRedirectUri: `https://${domain}/api/auth/google/callback`,
    appUser: "app",
    appDir: "/opt/png-json-pal",
    nodeBin: "/usr/bin/node",
    useTunnel: true,
    tunnelName: "png-json-pal",
    tunnelToken: "",
    tunnelId: "",
    tunnelCredFile: "/etc/cloudflared/tunnel.json",
    localBindHost: "127.0.0.1",
  };
}

export function SelfHostSetup() {
  const [cfg, setCfg] = useState<Cfg>(() => {
    if (typeof window === "undefined") return defaultCfg();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Cfg>;
        const merged = { ...defaultCfg(), ...saved };
        // Alte Platzhalter aus früheren Versionen bereinigen
        if (!merged.domain || merged.domain === "meine-domain.de") {
          merged.domain = detectDomain();
        }
        return merged;
      }
    } catch {}
    return defaultCfg();
  });

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }, [cfg]);

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => {
    setCfg((p) => {
      const next = { ...p, [k]: v };
      // auto-update redirect URI when domain changes (only if user hasn't customized it)
      if (k === "domain" && typeof v === "string") {
        const expectedOld = `https://${p.domain}/api/auth/google/callback`;
        if (p.googleRedirectUri === expectedOld || !p.googleRedirectUri) {
          next.googleRedirectUri = `https://${v}/api/auth/google/callback`;
        }
      }
      return next;
    });
  };

  const reset = () => {
    if (confirm("Alle Eingaben zurücksetzen?")) {
      localStorage.removeItem(STORAGE_KEY);
      setCfg(defaultCfg());
      toast.success("Zurückgesetzt");
    }
  };

  const files = useMemo(() => buildFiles(cfg), [cfg]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2 flex-1">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            Eingaben werden lokal im Browser gespeichert und sind beim nächsten Öffnen wieder da.
            Domain wird automatisch erkannt. Unten findest du fertige Dateien zum Kopieren.
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={reset}>
          <RefreshCw className="h-3.5 w-3.5" /> Zurücksetzen
        </Button>
      </div>

      {/* ---------- INPUT FIELDS ---------- */}
      <Section title="Server &amp; Domain">
        <Field label="Domain (ohne https://)" hint="Wird automatisch aus der aktuellen URL übernommen – anpassen wenn nötig">
          <Input value={cfg.domain} onChange={(e) => set("domain", e.target.value)} />
        </Field>
        <Field label="Port" hint="Lokaler Port des Node-Servers (hinter nginx)">
          <Input value={cfg.port} onChange={(e) => set("port", e.target.value)} />
        </Field>
        <Field label="System-User" hint="Linux-User, unter dem der Service läuft">
          <Input value={cfg.appUser} onChange={(e) => set("appUser", e.target.value)} />
        </Field>
        <Field label="Installations-Verzeichnis" hint="Absoluter Pfad zur App auf dem Server">
          <Input value={cfg.appDir} onChange={(e) => set("appDir", e.target.value)} />
        </Field>
        <Field label="Pfad zu node" hint="`which node` auf dem Server">
          <Input value={cfg.nodeBin} onChange={(e) => set("nodeBin", e.target.value)} />
        </Field>
      </Section>

      <Section title=".env (Secrets &amp; Pfade)">
        <Field
          label="JWT_SECRET"
          hint="Zufalls-Schlüssel für Sessions. Niemals teilen."
          action={
            <Button size="sm" variant="outline" onClick={() => set("jwtSecret", randomHex(32))}>
              <RefreshCw className="h-3.5 w-3.5" /> Neu erzeugen
            </Button>
          }
        >
          <Input value={cfg.jwtSecret} onChange={(e) => set("jwtSecret", e.target.value)} className="font-mono text-xs" />
        </Field>
        <Field label="DB_PATH" hint="Wo die SQLite-Datei abgelegt wird (wird automatisch erstellt)">
          <Input value={cfg.dbPath} onChange={(e) => set("dbPath", e.target.value)} />
        </Field>
        <Field label="FRONTEND_DIST" hint="Pfad zum gebauten Frontend (Vite `dist/`)">
          <Input value={cfg.frontendDist} onChange={(e) => set("frontendDist", e.target.value)} />
        </Field>
        <Field label="Initiales Admin-Passwort" hint="Nach erstem Login im Admin-Bereich ändern">
          <Input value={cfg.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
        </Field>
      </Section>

      <Section title="Google Login">
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Google-Login wird vollständig über Supabase Auth abgewickelt. Aktiviere
          den Google-Provider im Supabase-Dashboard unter <strong>Authentication →
          Providers → Google</strong> und trage als Site/Redirect URL deine
          öffentliche Domain ein (z.&nbsp;B. <code>https://{cfg.domain || "deine-domain.de"}/auth/callback</code>).
          Im Backend werden keine Google-OAuth-Credentials mehr benötigt.
        </div>
      </Section>

      <Section title="Cloudflare Tunnel (lokales Netz → Internet)">
        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
          <div className="font-medium">So funktioniert es:</div>
          <div className="text-muted-foreground">
            Die App läuft komplett bei dir im LAN (nur an <code>127.0.0.1</code> gebunden, keine offenen Ports im Router).
            <strong> cloudflared</strong> baut von innen eine ausgehende Verbindung zu Cloudflare auf und veröffentlicht
            deine Domain (<code>{cfg.domain || "deine-domain.de"}</code>) öffentlich mit HTTPS. Über genau diese
            öffentliche URL laufen dann auch Google Login &amp; alle Cloud-Dienste.
          </div>
        </div>
        <Field label="Cloudflare Tunnel verwenden" hint="Wenn an: nginx bindet nur an 127.0.0.1, cloudflared veröffentlicht die Domain.">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.useTunnel}
              onChange={(e) => {
                const on = e.target.checked;
                set("useTunnel", on);
                set("localBindHost", on ? "127.0.0.1" : "0.0.0.0");
              }}
            />
            <span className="text-xs text-muted-foreground">
              {cfg.useTunnel ? "Aktiv – nur lokal erreichbar + Tunnel" : "Aus – nginx öffentlich (Port 80/443 offen)"}
            </span>
          </div>
        </Field>
        <Field label="Tunnel-Name" hint="Frei wählbar, z. B. der App-Name">
          <Input value={cfg.tunnelName} onChange={(e) => set("tunnelName", e.target.value)} />
        </Field>
        <Field
          label="Tunnel-Token (empfohlen, Dashboard-Methode)"
          hint="Cloudflare Dashboard → Zero Trust → Networks → Tunnels → Create a tunnel → Token kopieren"
        >
          <Input
            type="password"
            placeholder="eyJhIjoi… (langer Token)"
            value={cfg.tunnelToken}
            onChange={(e) => set("tunnelToken", e.target.value)}
            className="font-mono text-xs"
          />
        </Field>
        <Field label="Tunnel-ID (nur bei CLI-Methode)" hint="Aus `cloudflared tunnel create <name>`. Bei Token-Methode leer lassen.">
          <Input value={cfg.tunnelId} onChange={(e) => set("tunnelId", e.target.value)} />
        </Field>
        <Field label="Pfad zur Credentials-Datei (nur CLI-Methode)" hint="z. B. /etc/cloudflared/<TUNNEL-ID>.json">
          <Input value={cfg.tunnelCredFile} onChange={(e) => set("tunnelCredFile", e.target.value)} />
        </Field>
        <Field label="Lokaler Bind-Host" hint="127.0.0.1 = nur Tunnel; 0.0.0.0 = auch direkt im LAN">
          <Input value={cfg.localBindHost} onChange={(e) => set("localBindHost", e.target.value)} />
        </Field>
      </Section>



      {/* ---------- OUTPUT FILES ---------- */}
      <div className="space-y-4 pt-2 border-t">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" /> Generierte Dateien &amp; Befehle
        </h3>
        {files.map((f) => (
          <FileBlock key={f.path} title={f.path} description={f.description} content={f.content} icon={f.icon} />
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold" dangerouslySetInnerHTML={{ __html: title }} />
      <div className="space-y-3 pl-1">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  action,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {action}
      </div>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FileBlock({
  title,
  description,
  content,
  icon,
}: {
  title: string;
  description: string;
  content: string;
  icon: "file" | "shell";
}) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center justify-between bg-muted/40 px-3 py-2 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {icon === "shell" ? (
            <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-mono truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{description}</div>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => copy(content, title)}>
          <Copy className="h-3.5 w-3.5" /> Kopieren
        </Button>
      </div>
      <Textarea
        readOnly
        value={content}
        className="font-mono text-xs rounded-none border-0 min-h-[160px] resize-y bg-background"
      />
    </div>
  );
}

// ------------ FILE BUILDERS ------------

function buildFiles(c: Cfg) {
  const envContent = `# server/.env
JWT_SECRET=${c.jwtSecret}
PORT=${c.port}
DB_PATH=${c.dbPath}
FRONTEND_DIST=${c.frontendDist}
ADMIN_INITIAL_PASSWORD=${c.adminPassword}
${c.googleClientId ? `GOOGLE_CLIENT_ID=${c.googleClientId}` : "# GOOGLE_CLIENT_ID="}
${c.googleClientSecret ? `GOOGLE_CLIENT_SECRET=${c.googleClientSecret}` : "# GOOGLE_CLIENT_SECRET="}
GOOGLE_REDIRECT_URI=${c.googleRedirectUri}
`;

  const frontendEnvContent = `# .env  (Frontend / Vite – im Projekt-Root)
# Wird beim \`npm run build\` eingelesen. Variablen müssen mit VITE_ beginnen,
# damit sie im Browser-Bundle landen.
VITE_API_BASE_URL=https://${c.domain}
VITE_APP_NAME=PNG JSON Pal
`;

  const viteConfigContent = `// vite.config.ts  (Projekt-Root) – Self-Host-Variante
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      allowedHosts: ["${c.domain}"],
    },
    preview: {
      allowedHosts: ["${c.domain}"],
    },
  },

  tanstackStart: {
    server: { entry: "server" },
  },
});
`;

  const systemdContent = `# /etc/systemd/system/png-json-pal.service
[Unit]
Description=PNG JSON Pal (Node + SQLite)
After=network.target

[Service]
Type=simple
User=${c.appUser}
WorkingDirectory=${c.appDir}/server
EnvironmentFile=${c.appDir}/server/.env
ExecStart=${c.nodeBin} dist/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
`;

  const nginxContent = c.useTunnel
    ? `# /etc/nginx/sites-available/${c.domain}
# Tunnel-Modus: nginx ist NUR auf 127.0.0.1 erreichbar.
# Public HTTPS macht cloudflared (siehe cloudflared/config.yml).
server {
  listen ${c.localBindHost}:80;
  server_name ${c.domain} localhost;

  client_max_body_size 50M;

  location / {
    proxy_pass http://127.0.0.1:${c.port};
    proxy_http_version 1.1;
    proxy_set_header Host              ${c.domain};
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
  }
}
`
    : `# /etc/nginx/sites-available/${c.domain}
server {
  listen 80;
  server_name ${c.domain};

  # → certbot --nginx -d ${c.domain}  übernimmt die TLS-Konfiguration

  client_max_body_size 50M;

  location / {
    proxy_pass http://127.0.0.1:${c.port};
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        "upgrade";
  }
}
`;

  const cloudflaredConfig = `# /etc/cloudflared/config.yml
# Cloudflared Konfiguration (CLI-Methode, ohne Dashboard-Token).
# Bei Token-Methode (empfohlen) wird DIESE Datei NICHT benötigt –
# stattdessen \`cloudflared service install <TOKEN>\` ausführen.
tunnel: ${c.tunnelId || "<TUNNEL-ID-AUS-CREATE-BEFEHL>"}
credentials-file: ${c.tunnelCredFile}

ingress:
  - hostname: ${c.domain}
    service: http://127.0.0.1:${c.port}
    originRequest:
      httpHostHeader: ${c.domain}
      noTLSVerify: true
  - service: http_status:404
`;

  const cloudflaredService = `# /etc/systemd/system/cloudflared.service
# Wird normalerweise automatisch durch \`cloudflared service install\` angelegt.
# Hier nur als Referenz / manuelle Variante:
[Unit]
Description=Cloudflare Tunnel (${c.tunnelName})
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate tunnel run ${c.tunnelName}
Restart=on-failure
RestartSec=5
User=cloudflared

[Install]
WantedBy=multi-user.target
`;

  const tunnelInstallScript = c.useTunnel
    ? `#!/usr/bin/env bash
# cloudflared-install.sh – Cloudflare Tunnel einrichten
# Vorher: in Cloudflare deine Domain "${c.domain || "deine-domain.de"}" hinzufügen
# (Nameserver auf Cloudflare zeigen lassen).
set -euo pipefail

# 1) cloudflared installieren (Debian/Ubuntu)
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \\
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \\
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared

# ---- VARIANTE A: Dashboard-Token (empfohlen, einfachster Weg) ----
# 1. Cloudflare Dashboard → Zero Trust → Networks → Tunnels → "Create a tunnel"
# 2. Connector "cloudflared" wählen → Token kopieren
# 3. Public Hostname anlegen:  ${c.domain}   →   http://127.0.0.1:${c.port}
# 4. Auf dem Server:
${c.tunnelToken ? `sudo cloudflared service install ${c.tunnelToken}` : "# sudo cloudflared service install <DEIN-TUNNEL-TOKEN>"}
# Fertig – cloudflared läuft als systemd-Service und veröffentlicht ${c.domain}.

# ---- VARIANTE B: CLI-Methode (selbst-verwaltete config.yml) ----
# sudo cloudflared tunnel login
# sudo cloudflared tunnel create ${c.tunnelName}
# (Credentials-Datei wird unter /root/.cloudflared/<ID>.json abgelegt – verschiebe
#  sie nach ${c.tunnelCredFile} und passe config.yml an.)
# sudo mkdir -p /etc/cloudflared
# sudo cp config.yml /etc/cloudflared/config.yml
# sudo cloudflared tunnel route dns ${c.tunnelName} ${c.domain}
# sudo cloudflared service install
# sudo systemctl enable --now cloudflared

echo "Tunnel läuft. Öffentlich erreichbar: https://${c.domain}"
`
    : `#!/usr/bin/env bash
# Tunnel-Modus ist deaktiviert – diese Datei wird nicht benötigt.
echo "Tunnel deaktiviert. Öffne stattdessen Port 80/443 in deinem Router auf den Server."
`;


  const installScript = `#!/usr/bin/env bash
# install.sh – auf dem Server als root ausführen
set -euo pipefail

APP_DIR="${c.appDir}"
APP_USER="${c.appUser}"
DOMAIN="${c.domain}"

# 1) System vorbereiten
apt-get update
apt-get install -y nginx git curl build-essential
# Node 20 (NodeSource):
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2) User & Verzeichnis
id "$APP_USER" &>/dev/null || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# 3) Code holen (anpassen: dein Git-Remote)
sudo -u "$APP_USER" git clone <DEIN_GIT_REMOTE> "$APP_DIR" || true

# 4) Frontend bauen
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

# 5) Server bauen
cd "$APP_DIR/server"
sudo -u "$APP_USER" npm ci
sudo -u "$APP_USER" npm run build

# 6) .env eintragen (Inhalt siehe Admin-UI → Datei: server/.env)
#    nano "$APP_DIR/server/.env"

# 7) systemd-Service installieren
cp png-json-pal.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now png-json-pal

# 8) nginx
cp nginx-${c.domain}.conf /etc/nginx/sites-available/${c.domain}
ln -sf /etc/nginx/sites-available/${c.domain} /etc/nginx/sites-enabled/${c.domain}
nginx -t && systemctl reload nginx

# 9) TLS
# apt-get install -y certbot python3-certbot-nginx
# certbot --nginx -d ${c.domain}

echo "Fertig. App läuft unter http://${c.domain}"
`;

  const updateScript = `#!/usr/bin/env bash
# update.sh – Update einer bestehenden Installation
set -euo pipefail
cd ${c.appDir}
sudo -u ${c.appUser} git pull --ff-only
sudo -u ${c.appUser} npm ci
sudo -u ${c.appUser} npm run build
cd server
sudo -u ${c.appUser} npm ci
sudo -u ${c.appUser} npm run build
systemctl restart png-json-pal
systemctl status --no-pager png-json-pal
`;

  const backupScript = `#!/usr/bin/env bash
# backup.sh – tägliches Backup der SQLite-DB
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
DEST=${c.appDir}/backups
mkdir -p "$DEST"
sqlite3 "${c.appDir}/server/${c.dbPath.replace(/^\.\//, "")}" ".backup '$DEST/app-$STAMP.db'"
find "$DEST" -name 'app-*.db' -mtime +30 -delete
`;

  return [
    {
      path: ".env",
      description: "Frontend-Umgebungsvariablen (Vite). Im Projekt-Root ablegen, vor `npm run build`.",
      content: frontendEnvContent,
      icon: "file" as const,
    },
    {
      path: "vite.config.ts",
      description: "Vite-Konfiguration im Projekt-Root (erlaubt deine Domain als Host).",
      content: viteConfigContent,
      icon: "file" as const,
    },
    {
      path: "server/.env",
      description: "Secrets & Laufzeit-Pfade des Node-Servers. Niemals in Git einchecken.",
      content: envContent,
      icon: "file" as const,
    },
    {
      path: "/etc/systemd/system/png-json-pal.service",
      description: "systemd Service-Definition (Autostart, Restart on failure).",
      content: systemdContent,
      icon: "file" as const,
    },
    {
      path: `/etc/nginx/sites-available/${c.domain}`,
      description: c.useTunnel
        ? "nginx Reverse Proxy – im Tunnel-Modus nur an 127.0.0.1 gebunden, kein Port nach außen."
        : "nginx Reverse Proxy auf den Node-Port.",
      content: nginxContent,
      icon: "file" as const,
    },
    ...(c.useTunnel
      ? [
          {
            path: "/etc/cloudflared/config.yml",
            description:
              "Cloudflare Tunnel Ingress – mappt deine Domain auf den lokalen Service (nur bei CLI-Methode nötig).",
            content: cloudflaredConfig,
            icon: "file" as const,
          },
          {
            path: "/etc/systemd/system/cloudflared.service",
            description: "systemd-Unit für cloudflared (Referenz – wird meist automatisch angelegt).",
            content: cloudflaredService,
            icon: "file" as const,
          },
          {
            path: "cloudflared-install.sh",
            description: "Cloudflare Tunnel installieren & starten. Domain muss in Cloudflare liegen.",
            content: tunnelInstallScript,
            icon: "shell" as const,
          },
        ]
      : []),
    {
      path: "install.sh",
      description: "Einmaliges Setup auf einem frischen Ubuntu/Debian-Server.",
      content: installScript,
      icon: "shell" as const,
    },
    {
      path: "update.sh",
      description: "Update + Neustart des Services.",
      content: updateScript,
      icon: "shell" as const,
    },
    {
      path: "backup.sh",
      description: "DB-Backup (täglich per cron empfohlen).",
      content: backupScript,
      icon: "shell" as const,
    },
  ];
}
