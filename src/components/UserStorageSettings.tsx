import { useEffect, useState } from "react";
import { Database, Cloud, CloudOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import {
  getStorageMode,
  setStorageMode,
  getCustomCloudConfig,
  setCustomCloudConfig,
  getWebDAVConfig,
  setWebDAVConfig,
  type StorageMode,
  type CustomCloudConfig,
  type WebDAVConfig,
} from "@/lib/storage-mode";
import { clearCustomSupabaseCache, getCustomSupabase } from "@/lib/custom-supabase";
import {
  connectGoogleDrive,
  disconnectGoogleDrive,
  connectOneDrive,
  disconnectOneDrive,
  connectDropbox,
  disconnectDropbox,
  loadOAuthAppConfig,
} from "@/lib/cloud-providers";
import { getStoredToken, isTokenValid, type ProviderId } from "@/lib/cloud-providers/oauth";

export function UserStorageSettings() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StorageMode>("local");
  const [cfg, setCfg] = useState<CustomCloudConfig>({
    url: "",
    anonKey: "",
    email: "",
    password: "",
  });
  const [dav, setDav] = useState<WebDAVConfig>({
    baseUrl: "",
    username: "",
    password: "",
    folder: "st-cs",
  });
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState<ProviderId | null>(null);
  const [tick, setTick] = useState(0); // re-render when auth changes

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const onAuth = () => setTick((t) => t + 1);
    window.addEventListener("cloud-auth-change", onAuth);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("cloud-auth-change", onAuth);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode(getStorageMode());
    setCfg(getCustomCloudConfig());
    setDav(getWebDAVConfig());
    void loadOAuthAppConfig(); // warm cache
  }, [open]);

  if (!session) return null;

  function applyMode(m: StorageMode) {
    setMode(m);
    setStorageMode(m);
    toast.success("Speichermodus geändert");
  }

  function saveCustom() {
    setCustomCloudConfig(cfg);
    clearCustomSupabaseCache();
    toast.success("Eigene Cloud gespeichert");
  }

  function saveDav() {
    setWebDAVConfig(dav);
    toast.success("WebDAV gespeichert");
  }

  async function testCustom() {
    setCustomCloudConfig(cfg);
    clearCustomSupabaseCache();
    setTesting(true);
    try {
      const c = await getCustomSupabase();
      const { error } = await c.from("lorebooks").select("id").limit(1);
      if (error) throw error;
      toast.success("Verbindung erfolgreich");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  async function doConnect(p: ProviderId) {
    setConnecting(p);
    try {
      if (p === "gdrive") await connectGoogleDrive();
      if (p === "onedrive") await connectOneDrive();
      if (p === "dropbox") await connectDropbox();
      toast.success("Verbunden");
      setTick((t) => t + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  function doDisconnect(p: ProviderId) {
    if (p === "gdrive") disconnectGoogleDrive();
    if (p === "onedrive") disconnectOneDrive();
    if (p === "dropbox") disconnectDropbox();
    toast.success("Getrennt");
    setTick((t) => t + 1);
  }

  // suppress unused-warning: tick is intentionally used to force re-render
  void tick;

  const gConnected = isTokenValid(getStoredToken("gdrive"));
  const mConnected = isTokenValid(getStoredToken("onedrive"));
  const dConnected = isTokenValid(getStoredToken("dropbox"));

  return (
    <>
      <button
        type="button"
        aria-label="Speicher-Einstellungen"
        onClick={() => setOpen(true)}
        className="fixed bottom-16 right-4 z-50 h-10 w-10 rounded-full bg-background/80 backdrop-blur border border-border shadow-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Database className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Speicherort wählen</DialogTitle>
            <DialogDescription>
              Lege fest, wo deine Lorebooks und User Cards gespeichert werden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ModeRow
              checked={mode === "local"}
              onSelect={() => applyMode("local")}
              title="Lokal im Browser"
              desc="Daten bleiben nur in diesem Browser. Kein Upload, kein Sync."
            />

            <ProviderRow
              checked={mode === "gdrive"}
              onSelect={() => applyMode("gdrive")}
              title="Google Drive"
              desc="Speichert verschlüsselt im versteckten App-Ordner deines Google Drive."
              connected={gConnected}
              busy={connecting === "gdrive"}
              onConnect={() => doConnect("gdrive")}
              onDisconnect={() => doDisconnect("gdrive")}
            />

            <ProviderRow
              checked={mode === "onedrive"}
              onSelect={() => applyMode("onedrive")}
              title="Microsoft OneDrive"
              desc="Speichert im App-Ordner deines persönlichen OneDrive."
              connected={mConnected}
              busy={connecting === "onedrive"}
              onConnect={() => doConnect("onedrive")}
              onDisconnect={() => doDisconnect("onedrive")}
            />

            <ProviderRow
              checked={mode === "dropbox"}
              onSelect={() => applyMode("dropbox")}
              title="Dropbox"
              desc="Speichert im App-Ordner deiner Dropbox (Apps/…)."
              connected={dConnected}
              busy={connecting === "dropbox"}
              onConnect={() => doConnect("dropbox")}
              onDisconnect={() => doDisconnect("dropbox")}
            />

            <ModeRow
              checked={mode === "webdav"}
              onSelect={() => applyMode("webdav")}
              title="WebDAV / Nextcloud"
              desc="Beliebiger WebDAV-Server (Nextcloud, ownCloud …) mit Nutzername & Passwort."
            />

            {mode === "webdav" && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="space-y-1">
                  <Label>Server-URL</Label>
                  <Input
                    placeholder="https://cloud.example.com/remote.php/dav/files/USERNAME"
                    value={dav.baseUrl}
                    onChange={(e) => setDav({ ...dav, baseUrl: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Bei Nextcloud findest du diese URL in den Einstellungen unter „WebDAV".
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Benutzername</Label>
                    <Input
                      value={dav.username}
                      onChange={(e) => setDav({ ...dav, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>App-Passwort</Label>
                    <Input
                      type="password"
                      value={dav.password}
                      onChange={(e) => setDav({ ...dav, password: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Unterordner</Label>
                  <Input
                    value={dav.folder}
                    onChange={(e) => setDav({ ...dav, folder: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={saveDav}>
                    Speichern
                  </Button>
                </div>
              </div>
            )}

            <ModeRow
              checked={mode === "custom"}
              onSelect={() => applyMode("custom")}
              title="Eigene Supabase-Cloud"
              desc="Verbinde dein eigenes Supabase-Projekt mit den Tabellen lorebooks und user_cards."
            />

            {mode === "custom" && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <div className="space-y-1">
                  <Label>Supabase URL</Label>
                  <Input
                    placeholder="https://xxxx.supabase.co"
                    value={cfg.url}
                    onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Anon / Publishable Key</Label>
                  <Textarea
                    rows={2}
                    value={cfg.anonKey}
                    onChange={(e) => setCfg({ ...cfg, anonKey: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>E-Mail</Label>
                    <Input
                      type="email"
                      value={cfg.email}
                      onChange={(e) => setCfg({ ...cfg, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Passwort</Label>
                    <Input
                      type="password"
                      value={cfg.password}
                      onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={testCustom} disabled={testing}>
                    {testing ? "Teste…" : "Verbindung testen"}
                  </Button>
                  <Button size="sm" onClick={saveCustom}>
                    Speichern
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModeRow({
  checked,
  onSelect,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
      <input
        type="radio"
        name="usm"
        className="mt-1"
        checked={checked}
        onChange={onSelect}
      />
      <div className="flex-1">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </label>
  );
}

function ProviderRow({
  checked,
  onSelect,
  title,
  desc,
  connected,
  busy,
  onConnect,
  onDisconnect,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
      <input
        type="radio"
        name="usm"
        className="mt-1"
        checked={checked}
        onChange={onSelect}
      />
      <div className="flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              {title}
              {connected && (
                <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]">
                  <CheckCircle2 className="h-3 w-3" /> verbunden
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
          {connected ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                onDisconnect();
              }}
            >
              <CloudOff className="h-4 w-4" />
              Trennen
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                onConnect();
              }}
            >
              <Cloud className="h-4 w-4" />
              {busy ? "Verbinde…" : "Verbinden"}
            </Button>
          )}
        </div>
      </div>
    </label>
  );
}
