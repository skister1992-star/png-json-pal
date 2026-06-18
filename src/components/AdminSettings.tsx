import { useCallback, useEffect, useState } from "react";
import {
  Settings,
  Trash2,
  Ban,
  KeyRound,
  RefreshCw,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api, type AppUser } from "@/lib/api-client";
import { SelfHostSetup } from "@/components/SelfHostSetup";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export function AdminSettings() {
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pass, setPass] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api.admin.check().then(setAuthed);
  }, [open]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    try {
      await api.admin.login(pass);
      setAuthed(true);
      setPass("");
      toast.success("Admin angemeldet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    try {
      await api.admin.logout();
    } catch {
      /* noop */
    }
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle>Admin Einstellungen</DialogTitle>
                <DialogDescription>
                  Verwaltung des eigenen Servers (Nutzer, Passwort, Google-OAuth).
                </DialogDescription>
              </div>
              <ServerStatus />
            </div>
          </DialogHeader>

          {authed === null ? (
            <div className="text-sm text-muted-foreground">Lade…</div>
          ) : !authed ? (
            <form onSubmit={doLogin} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ap">Admin Passwort</Label>
                <Input
                  id="ap"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? "Wird geprüft…" : "Anmelden"}
              </Button>
            </form>
          ) : (
            <Tabs defaultValue="users">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="users">Nutzer</TabsTrigger>
                <TabsTrigger value="password">Passwort</TabsTrigger>
                <TabsTrigger value="google">Google OAuth</TabsTrigger>
                <TabsTrigger value="setup">Self-Host</TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="pt-4">
                <UsersPanel onAuthLost={() => setAuthed(false)} />
              </TabsContent>

              <TabsContent value="password" className="pt-4">
                <PasswordPanel />
              </TabsContent>

              <TabsContent value="google" className="pt-4">
                <GoogleOAuthPanel />
              </TabsContent>

              <TabsContent value="setup" className="pt-4">
                <SelfHostSetup />
              </TabsContent>
            </Tabs>
          )}

          {authed && (
            <div className="flex justify-end pt-4 border-t">
              <Button variant="ghost" size="sm" onClick={logout}>
                Abmelden
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ----------------- USERS PANEL -----------------

function UsersPanel({ onAuthLost }: { onAuthLost: () => void }) {
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.admin.listUsers();
      setUsers(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler";
      toast.error(msg);
      if (msg.toLowerCase().includes("unauthorized") || msg.includes("401")) {
        onAuthLost();
      }
    } finally {
      setLoading(false);
    }
  }, [onAuthLost]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function doDelete(u: AppUser) {
    if (!confirm(`Nutzer ${u.email} endgültig löschen?`)) return;
    try {
      await api.admin.deleteUser(u.id);
      toast.success("Nutzer gelöscht");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function doBan(u: AppUser, ban: boolean) {
    try {
      await api.admin.banUser(u.id, ban);
      toast.success(ban ? "Nutzer gesperrt" : "Nutzer entsperrt");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {users ? `${users.length} Nutzer` : "Lade…"}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <div className="border rounded-md divide-y">
        {users?.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Keine Nutzer gefunden.
          </div>
        )}
        {users?.map((u) => {
          const banned = !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
          return (
            <div key={u.id} className="p-3 text-sm flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{u.email}</div>
                <div className="text-xs text-muted-foreground">
                  {u.provider} · seit {fmt(u.created_at)} · letzter Login {fmt(u.last_login_at)}
                  {banned && <span className="ml-2 text-destructive">· gesperrt</span>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => doBan(u, !banned)}
                  title={banned ? "Entsperren" : "Sperren"}
                >
                  {banned ? <KeyRound className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => doDelete(u)}
                  className="text-destructive hover:text-destructive"
                  title="Löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------- PASSWORD PANEL -----------------

function PasswordPanel() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (a.length < 6) return toast.error("Mindestens 6 Zeichen");
    if (a !== b) return toast.error("Passwörter stimmen nicht überein");
    setBusy(true);
    try {
      await api.admin.changePassword(a);
      toast.success("Admin-Passwort geändert");
      setA("");
      setB("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <p className="text-xs text-muted-foreground">
        Das Admin-Passwort wird im Backend (SQLite, bcrypt) gespeichert.
      </p>
      <div className="space-y-1">
        <Label>Neues Passwort</Label>
        <Input type="password" value={a} onChange={(e) => setA(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Wiederholen</Label>
        <Input type="password" value={b} onChange={(e) => setB(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Speichern…" : "Passwort ändern"}
      </Button>
    </form>
  );
}

// ----------------- GOOGLE OAUTH PANEL -----------------

function GoogleOAuthPanel() {
  const [cfg, setCfg] = useState({
    google_client_id: "",
    google_client_secret: "",
    google_redirect_uri:
      typeof window !== "undefined" ? `${window.location.origin}/api/auth/google/callback` : "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.admin
      .getOAuth()
      .then((c) =>
        setCfg((prev) => ({
          ...prev,
          ...(c.google_client_id ? { google_client_id: c.google_client_id } : {}),
          ...(c.google_client_secret ? { google_client_secret: c.google_client_secret } : {}),
          ...(c.google_redirect_uri ? { google_redirect_uri: c.google_redirect_uri } : {}),
        })),
      )
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api.admin.setOAuth(cfg);
      toast.success("Google OAuth gespeichert");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Lade…</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Eigene Google OAuth-Credentials für „Login mit Google" und die optionale
        Google-Drive-Anbindung. Erstellen in der Google Cloud Console →
        „APIs & Services" → „Credentials" → OAuth 2.0 Client ID (Web).
      </p>
      <div className="space-y-1">
        <Label>Redirect URI (so in Google eintragen)</Label>
        <Input
          value={cfg.google_redirect_uri}
          onChange={(e) => setCfg({ ...cfg, google_redirect_uri: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Client ID</Label>
        <Input
          placeholder="xxxxx.apps.googleusercontent.com"
          value={cfg.google_client_id}
          onChange={(e) => setCfg({ ...cfg, google_client_id: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Client Secret</Label>
        <Input
          type="password"
          value={cfg.google_client_secret}
          onChange={(e) => setCfg({ ...cfg, google_client_secret: e.target.value })}
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={busy}>
          {busy ? "Speichern…" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}

// ----------------- SERVER STATUS -----------------

function ServerStatus() {
  const [status, setStatus] = useState<"online" | "offline" | "demo" | "checking">("checking");

  useEffect(() => {
    setStatus("checking");
    api.health().then((h) => {
      if (h?.demo) setStatus("demo");
      else if (h?.ok) setStatus("online");
      else setStatus("offline");
    }).catch(() => setStatus("offline"));
  }, []);

  const configs = {
    online: { label: "Server online", dot: "bg-green-500", iconColor: "text-green-600" },
    offline: { label: "Server offline", dot: "bg-red-500", iconColor: "text-red-600" },
    demo: { label: "Demo-Modus (kein Server)", dot: "bg-amber-500", iconColor: "text-amber-600" },
    checking: { label: "Prüfe…", dot: "bg-muted-foreground", iconColor: "text-muted-foreground" },
  };
  const c = configs[status];

  return (
    <div className="flex items-center gap-2 text-xs shrink-0">
      <Server className={`h-4 w-4 ${c.iconColor}`} />
      <span className="text-muted-foreground hidden sm:inline">{c.label}</span>
      <span className={`h-2 w-2 rounded-full ${c.dot} ${status === "checking" ? "animate-pulse" : ""}`} />
    </div>
  );
}
