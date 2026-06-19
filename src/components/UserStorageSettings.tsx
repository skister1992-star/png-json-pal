import { useEffect, useState } from "react";
import { Database, Cloud, CloudOff, CheckCircle2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getStorageMode,
  setStorageMode,
  type StorageMode,
} from "@/lib/storage-mode";
import { connectGoogleDrive, disconnectGoogleDrive, getMyRoles, type AppRole } from "@/lib/cloud-providers";
import { useSession } from "@/components/SiteHeader";

export function UserStorageSettings() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StorageMode>("local");
  const [connecting, setConnecting] = useState(false);
  const [tick, setTick] = useState(0);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const approved = roles.includes("approved") || roles.includes("admin");
  const hasGdriveToken = !!session;

  useEffect(() => {
    if (!open) return;
    setMode(getStorageMode());
    void getMyRoles().then(setRoles);
  }, [open, session?.user?.id]);

  useEffect(() => {
    const onAuth = () => setTick((t) => t + 1);
    window.addEventListener("cloud-auth-change", onAuth);
    return () => window.removeEventListener("cloud-auth-change", onAuth);
  }, []);

  // Auto-fallback to local if Drive mode is active but no Supabase session.
  useEffect(() => {
    const m = getStorageMode();
    if (m === "gdrive" && !session) {
      setStorageMode("local");
      setMode("local");
      toast.message("Google Drive Verbindung verloren – zurück auf Lokal.");
    }
  }, [tick, session]);

  if (!session) return null;

  function activate(m: StorageMode, label: string) {
    setStorageMode(m);
    setMode(m);
    toast.success(`Speicherort aktiv: ${label}`);
  }

  async function doConnect() {
    setConnecting(true);
    try {
      await connectGoogleDrive();
      toast.success("Mit Google Drive verbunden");
      setTick((t) => t + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  function doDisconnect() {
    disconnectGoogleDrive();
    if (getStorageMode() === "gdrive") {
      setStorageMode("local");
      setMode("local");
    }
    toast.success("Google Drive getrennt");
    setTick((t) => t + 1);
  }

  // Drive is "connected" when a Supabase session exists; the provider_token
  // comes from Supabase Google OAuth.
  const gConnected = hasGdriveToken;
  // legacy local-storage token compat (no longer used, kept to avoid breaking imports)
  void getStoredToken; void isTokenValid;

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
              Deine eigenen Inhalte (Lorebooks, User Cards) bleiben nur in diesem
              Browser oder optional in deinem Google Drive.
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

            <div
              className={`rounded-md border p-3 ${mode === "server" ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Server (Lovable Cloud)
                    {mode === "server" && <ActiveBadge />}
                    {!approved && (
                      <span className="text-[11px] text-amber-600">
                        Freigabe durch Admin erforderlich
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Daten werden verschlüsselt auf dem Server gespeichert und sind über
                    alle Geräte verfügbar. Nur freigegebene Konten (Rolle <code>approved</code>
                    oder <code>admin</code>) können diese Option nutzen.
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => activate("server", "Server")}
                  disabled={!approved || mode === "server"}
                >
                  {mode === "server" ? "Aktiv" : "Als Speicherort verwenden"}
                </Button>
              </div>
            </div>


            <div
              className={`rounded-md border p-3 ${mode === "gdrive" ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium text-sm flex items-center gap-2">
                    Google Drive
                    {mode === "gdrive" && <ActiveBadge />}
                    {gConnected && mode !== "gdrive" && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px]">
                        <CheckCircle2 className="h-3 w-3" /> verbunden
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Speichert deine Inhalte im versteckten App-Ordner (appDataFolder) deines
                    Google Drive – getrennt nach <code>lorebooks/</code> und <code>usercards/</code>.
                    Kein Client-Secret, kein Server-OAuth.
                  </div>

                </div>
                <div className="flex flex-col gap-2 items-end">
                  {gConnected ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => activate("gdrive", "Google Drive")}
                        disabled={mode === "gdrive"}
                      >
                        {mode === "gdrive" ? "Aktiv" : "Als Speicherort verwenden"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={doDisconnect}>
                        <CloudOff className="h-3.5 w-3.5" /> Trennen
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" disabled={connecting} onClick={doConnect}>
                      <Cloud className="h-4 w-4" />
                      {connecting ? "Verbinde…" : "Verbinden"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
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
}: {
  active: boolean;
  title: string;
  desc: string;
  actionLabel: string;
  actionDisabled?: boolean;
  onAction: () => void;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${active ? "border-emerald-500/50 bg-emerald-500/5" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-sm flex items-center gap-2">
            {title}
            {active && <ActiveBadge />}
          </div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <Button size="sm" onClick={onAction} disabled={actionDisabled}>
          {active ? "Aktiv" : actionLabel}
        </Button>
      </div>
    </div>
  );
}
