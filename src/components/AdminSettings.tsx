import { useEffect, useState } from "react";
import { Settings, Copy, Check } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const ADMIN_USER = "root:admin";
const ADMIN_PASS = "admin:root";
const ADMIN_FLAG = "admin_authed_v1";
const CFG_KEY = "self_host_config_v1";

type SelfHostConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  googleClientId: string;
  googleClientSecret: string;
  siteUrl: string;
  redirectUrls: string;
};

const EMPTY: SelfHostConfig = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  googleClientId: "",
  googleClientSecret: "",
  siteUrl: typeof window !== "undefined" ? window.location.origin : "",
  redirectUrls: "",
};

function loadCfg(): SelfHostConfig {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return EMPTY;
  }
}

function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

export function AdminSettings() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [cfg, setCfg] = useState<SelfHostConfig>(EMPTY);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAuthed(sessionStorage.getItem(ADMIN_FLAG) === "1");
    setCfg(loadCfg());
  }, [open]);

  const callbackUrl = cfg.supabaseUrl
    ? `${cfg.supabaseUrl.replace(/\/$/, "")}/auth/v1/callback`
    : "<deine Supabase URL>/auth/v1/callback";

  function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem(ADMIN_FLAG, "1");
      setAuthed(true);
      setUser("");
      setPass("");
      toast.success("Admin angemeldet");
    } else {
      toast.error("Falsche Zugangsdaten");
    }
  }

  function save() {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    toast.success("Konfiguration gespeichert (lokal im Browser)");
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_FLAG);
    setAuthed(false);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Admin Einstellungen"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full bg-background/80 backdrop-blur border border-border shadow-md grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <Settings className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Admin Einstellungen</DialogTitle>
            <DialogDescription>
              Konfiguration für Self-Hosting auf eigener Domain.
            </DialogDescription>
          </DialogHeader>

          {!authed ? (
            <form onSubmit={doLogin} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="au">Benutzername</Label>
                <Input id="au" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="off" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ap">Passwort</Label>
                <Input id="ap" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off" />
              </div>
              <Button type="submit" className="w-full">Anmelden</Button>
            </form>
          ) : (
            <Tabs defaultValue="supabase">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="supabase">Backend</TabsTrigger>
                <TabsTrigger value="google">Google OAuth</TabsTrigger>
                <TabsTrigger value="guide">Anleitung</TabsTrigger>
              </TabsList>

              <TabsContent value="supabase" className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">
                  Nach dem Export auf deinen Server: Trage hier die Verbindungsdaten deiner eigenen Supabase-Instanz ein.
                  Diese Werte musst du außerdem in deiner <code>.env</code> (<code>VITE_SUPABASE_URL</code>,
                  <code> VITE_SUPABASE_PUBLISHABLE_KEY</code>) setzen und neu bauen.
                </p>
                <div className="space-y-1">
                  <Label>Supabase URL</Label>
                  <Input
                    placeholder="https://xxxx.supabase.co"
                    value={cfg.supabaseUrl}
                    onChange={(e) => setCfg({ ...cfg, supabaseUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Supabase Anon / Publishable Key</Label>
                  <Textarea
                    rows={3}
                    value={cfg.supabaseAnonKey}
                    onChange={(e) => setCfg({ ...cfg, supabaseAnonKey: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Site URL (deine Domain)</Label>
                  <Input
                    placeholder="https://meine-domain.de"
                    value={cfg.siteUrl}
                    onChange={(e) => setCfg({ ...cfg, siteUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Zusätzliche Redirect URLs (kommagetrennt)</Label>
                  <Textarea
                    rows={2}
                    placeholder="https://meine-domain.de/**, http://localhost:3000/**"
                    value={cfg.redirectUrls}
                    onChange={(e) => setCfg({ ...cfg, redirectUrls: e.target.value })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="google" className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">
                  Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client ID erstellen.
                  Die folgende Callback-URL muss als „Authorized redirect URI" eingetragen werden:
                </p>
                <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs font-mono break-all">
                  <span className="flex-1">{callbackUrl}</span>
                  <CopyField value={callbackUrl} />
                </div>
                <div className="space-y-1">
                  <Label>Google Client ID</Label>
                  <Input
                    placeholder="xxxxx.apps.googleusercontent.com"
                    value={cfg.googleClientId}
                    onChange={(e) => setCfg({ ...cfg, googleClientId: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Google Client Secret</Label>
                  <Input
                    type="password"
                    placeholder="GOCSPX-..."
                    value={cfg.googleClientSecret}
                    onChange={(e) => setCfg({ ...cfg, googleClientSecret: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Diese Werte müssen anschließend in deinem Supabase-Projekt unter
                  <em> Authentication → Providers → Google</em> hinterlegt werden. Hier werden sie nur lokal in deinem
                  Browser zwischengespeichert.
                </p>
              </TabsContent>

              <TabsContent value="guide" className="space-y-2 pt-4 text-sm">
                <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
                  <li>App exportieren und auf deinem Server / deiner Domain bereitstellen.</li>
                  <li>Eigene Supabase-Instanz (Cloud oder Self-Host) erstellen.</li>
                  <li>
                    In Google Cloud Console einen OAuth 2.0 Client erstellen, deine Domain als „Authorized JavaScript
                    origin" und die oben angezeigte Callback-URL als „Authorized redirect URI" eintragen.
                  </li>
                  <li>
                    Client ID + Secret in Supabase unter <em>Authentication → Providers → Google</em> eintragen und
                    Google aktivieren.
                  </li>
                  <li>
                    In Supabase unter <em>Authentication → URL Configuration</em> deine Site URL und Redirect URLs
                    setzen.
                  </li>
                  <li>
                    In der <code>.env</code> deiner Export-Kopie <code>VITE_SUPABASE_URL</code> und
                    <code> VITE_SUPABASE_PUBLISHABLE_KEY</code> auf deine Werte setzen, dann neu bauen.
                  </li>
                </ol>
              </TabsContent>
            </Tabs>
          )}

          {authed && (
            <div className="flex justify-between pt-4 border-t">
              <Button variant="ghost" size="sm" onClick={logout}>Abmelden</Button>
              <Button onClick={save}>Speichern</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
