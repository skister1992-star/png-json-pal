import { useCallback, useEffect, useState } from "react";
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
import { testWebDAVConnection } from "@/lib/cloud-providers/webdav";
import { getStoredToken, isTokenValid, type ProviderId } from "@/lib/cloud-providers/oauth";

type GateProvider = "gdrive" | "onedrive" | "dropbox";

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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<ProviderId | null>(null);
  const [customVerified, setCustomVerified] = useState(false);
  const [webdavVerified, setWebdavVerified] = useState(false);
  const [tick, setTick] = useState(0);
  const [appCfg, setAppCfg] = useState<{
    google: boolean;
    onedrive: boolean;
    dropbox: boolean;
  }>({ google: false, onedrive: false, dropbox: false });

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
    setCustomVerified(false);
    setWebdavVerified(false);
    loadOAuthAppConfig().then((c) => {
      setAppCfg({
        google: !!c.google_client_id,
        onedrive: !!c.microsoft_client_id,
        dropbox: !!c.dropbox_app_key,
      });
    });
  }, [open]);

  // Auto-fallback: if the currently active mode lost its requirements, revert to local.
  const checkActiveValid = useCallback(() => {
    const m = getStorageMode();
    if (m === "local") return;
    let ok = true;
    if (m === "gdrive" || m === "onedrive" || m === "dropbox") {
      ok = isTokenValid(getStoredToken(m));
    } else if (m === "webdav") {
      const w = getWebDAVConfig();
      ok = !!w.baseUrl && !!w.username;
    } else if (m === "custom") {
      const c = getCustomCloudConfig();
      ok = !!c.url && !!c.anonKey;
    }
    if (!ok) {
      setStorageMode("local");
      setMode("local");
      toast.message("Verbindung getrennt – Speicher auf Lokal zurückgesetzt.");
    }
  }, []);

  useEffect(() => {
    checkActiveValid();
  }, [tick, checkActiveValid]);

  if (!session) return null;

  function activate(m: StorageMode, label: string) {
    setStorageMode(m);
    setMode(m);
    toast.success(`Speicherort aktiv: ${label}`);
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

  async function connectAndActivateCustom() {
    setBusyAction("custom");
    try {
      setCustomCloudConfig(cfg);
      clearCustomSupabaseCache();
      const c = await getCustomSupabase();
      const { error } = await c.from("lorebooks").select("id").limit(1);
      if (error) throw error;
      setCustomVerified(true);
      activate("custom", "Eigene Supabase-Cloud");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function connectAndActivateWebDAV() {
    setBusyAction("webdav");
    try {
      setWebDAVConfig(dav);
      await testWebDAVConnection(dav);
      setWebdavVerified(true);
      activate("webdav", "WebDAV / Nextcloud");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  void tick;

  const gConnected = isTokenValid(getStoredToken("gdrive"));
  const mConnected = isTokenValid(getStoredToken("onedrive"));
  const dConnected = isTokenValid(getStoredToken("dropbox"));

  function providerActivate(p: GateProvider) {
    const labels: Record<GateProvider, string> = {
      gdrive: "Google Drive",
      onedrive: "Microsoft OneDrive",
      dropbox: "Dropbox",
    };
    activate(p, labels[p]);
  }

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
              Aktiv wird ein Speicherort erst nach erfolgreicher Verbindung.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Row
              active={mode === "local"}
              title="Lokal im Browser"
              desc="Daten bleiben nur in diesem Browser. Kein Upload, kein Sync."
              actionLabel="Als Speicherort verwenden"
              actionDisabled={mode === "local"}
              onAction={() => activate("local", "Lokal")}
            />

            {appCfg.google && (
              <ProviderRow
                active={mode === "gdrive"}
                title="Google Drive"
                desc="Speichert verschlüsselt im versteckten App-Ordner deines Google Drive."
                connected={gConnected}
                busy={connecting === "gdrive"}
                onConnect={() => doConnect("gdrive")}
                onDisconnect={() => doDisconnect("gdrive")}
                onActivate={() => providerActivate("gdrive")}
              />
            )}

            {appCfg.onedrive && (
              <ProviderRow
                active={mode === "onedrive"}
                title="Microsoft OneDrive"
                desc="Speichert im App-Ordner deines persönlichen OneDrive."
                connected={mConnected}
                busy={connecting === "onedrive"}
                onConnect={() => doConnect("onedrive")}
                onDisconnect={() => doDisconnect("onedrive")}
                onActivate={() => providerActivate("onedrive")}
              />
            )}

            {appCfg.dropbox && (
              <ProviderRow
                active={mode === "dropbox"}
                title="Dropbox"
                desc="Speichert im App-Ordner deiner Dropbox (Apps/…)."
                connected={dConnected}
                busy={connecting === "dropbox"}
                onConnect={() => doConnect("dropbox")}
                onDisconnect={() => doDisconnect("dropbox")}
                onActivate={() => providerActivate("dropbox")}
              />
            )}

            <Row
              active={mode === "webdav"}
              title="WebDAV / Nextcloud"
              desc="Beliebiger WebDAV-Server (Nextcloud, ownCloud …) mit Nutzername & Passwort."
            >
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <Label>Server-URL</Label>
                  <Input
                    placeholder="https://cloud.example.com/remote.php/dav/files/USERNAME"
                    value={dav.baseUrl}
                    onChange={(e) => {
                      setDav({ ...dav, baseUrl: e.target.value });
                      setWebdavVerified(false);
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Benutzername</Label>
                    <Input
                      value={dav.username}
                      onChange={(e) => {
                        setDav({ ...dav, username: e.target.value });
                        setWebdavVerified(false);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>App-Passwort</Label>
                    <Input
                      type="password"
                      value={dav.password}
                      onChange={(e) => {
                        setDav({ ...dav, password: e.target.value });
                        setWebdavVerified(false);
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Unterordner</Label>
                  <Input
                    value={dav.folder}
                    onChange={(e) => {
                      setDav({ ...dav, folder: e.target.value });
                      setWebdavVerified(false);
                    }}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={connectAndActivateWebDAV}
                    disabled={busyAction === "webdav" || !dav.baseUrl || !dav.username}
                  >
                    {busyAction === "webdav"
                      ? "Verbinde…"
                      : webdavVerified && mode === "webdav"
                        ? "Aktiv"
                        : "Verbinden & aktivieren"}
                  </Button>
                </div>
              </div>
            </Row>

            <Row
              active={mode === "custom"}
              title="Eigene Supabase-Cloud"
              desc="Verbinde dein eigenes Supabase-Projekt mit den Tabellen lorebooks und user_cards."
            >
              <div className="space-y-3 mt-2">
                <div className="space-y-1">
                  <Label>Supabase URL</Label>
                  <Input
                    placeholder="https://xxxx.supabase.co"
                    value={cfg.url}
                    onChange={(e) => {
                      setCfg({ ...cfg, url: e.target.value });
                      setCustomVerified(false);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Anon / Publishable Key</Label>
                  <Textarea
                    rows={2}
                    value={cfg.anonKey}
                    onChange={(e) => {
                      setCfg({ ...cfg, anonKey: e.target.value });
                      setCustomVerified(false);
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>E-Mail</Label>
                    <Input
                      type="email"
                      value={cfg.email}
                      onChange={(e) => {
                        setCfg({ ...cfg, email: e.target.value });
                        setCustomVerified(false);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Passwort</Label>
                    <Input
                      type="password"
                      value={cfg.password}
                      onChange={(e) => {
                        setCfg({ ...cfg, password: e.target.value });
                        setCustomVerified(false);
                      }}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={connectAndActivateCustom}
                    disabled={busyAction === "custom" || !cfg.url || !cfg.anonKey}
                  >
                    {busyAction === "custom"
                      ? "Verbinde…"
                      : customVerified && mode === "custom"
                        ? "Aktiv"
                        : "Verbinden & aktivieren"}
                  </Button>
                </div>
              </div>
            </Row>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-medium px-2 py-0.5">
      <CheckCircle2 className="h-3 w-3" /> aktiv
    </span>
  );
}

function Row({
  active,
  title,
  desc,
  actionLabel,
  actionDisabled,
  onAction,
  children,
}: {
  active: boolean;
  title: string;
  desc: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-md border p-3 ${active ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-sm flex items-center gap-2">
            {title}
            {active && <ActiveBadge />}
          </div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        {actionLabel && onAction && (
          <Button size="sm" onClick={onAction} disabled={actionDisabled}>
            {active ? "Aktiv" : actionLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}

function ProviderRow({
  active,
  title,
  desc,
  connected,
  busy,
  onConnect,
  onDisconnect,
  onActivate,
}: {
  active: boolean;
  title: string;
  desc: string;
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onActivate: () => void;
}) {
  return (
    <div className={`rounded-md border p-3 ${active ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-sm flex items-center gap-2">
            {title}
            {active && <ActiveBadge />}
            {connected && !active && (
              <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]">
                <CheckCircle2 className="h-3 w-3" /> verbunden
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <div className="flex flex-col gap-2 items-end">
          {connected ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={onActivate}
                disabled={active}
                title={active ? "Bereits aktiv" : "Als Speicherort verwenden"}
              >
                {active ? "Aktiv" : "Als Speicherort verwenden"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onDisconnect}>
                <CloudOff className="h-3.5 w-3.5" /> Trennen
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={onConnect}>
              <Cloud className="h-4 w-4" />
              {busy ? "Verbinde…" : "Verbinden"}
            </Button>
          )}
          {!connected && (
            <span className="text-[10px] text-muted-foreground">Erst verbinden</span>
          )}
        </div>
      </div>
    </div>
  );
}
