import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Settings,
  Copy,
  Check,
  Trash2,
  Ban,
  KeyRound,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Mail,
} from "lucide-react";
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
import {
  adminLogin,
  adminLogout,
  adminChangePassword,
  adminListUsers,
  adminGetUser,
  adminDeleteUser,
  adminBanUser,
  adminSendPasswordReset,
} from "@/lib/admin.functions";
import { getStorageMode, setStorageMode, type StorageMode } from "@/lib/storage-mode";

const TOKEN_KEY = "admin_token_v2";
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
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
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

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  provider: string;
};

type UserDetails = Awaited<ReturnType<typeof adminGetUser>>;

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
  const [token, setToken] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [cfg, setCfg] = useState<SelfHostConfig>(EMPTY);
  const [storageMode, setStorageModeState] = useState<StorageMode>("cloud");

  const loginFn = useServerFn(adminLogin);
  const logoutFn = useServerFn(adminLogout);
  const changePassFn = useServerFn(adminChangePassword);
  const listFn = useServerFn(adminListUsers);
  const getUserFn = useServerFn(adminGetUser);
  const delUserFn = useServerFn(adminDeleteUser);
  const banFn = useServerFn(adminBanUser);
  const resetFn = useServerFn(adminSendPasswordReset);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setToken(sessionStorage.getItem(TOKEN_KEY));
    setCfg(loadCfg());
    setStorageModeState(getStorageMode());
  }, [open]);

  const callbackUrl = cfg.supabaseUrl
    ? `${cfg.supabaseUrl.replace(/\/$/, "")}/auth/v1/callback`
    : "<deine Supabase URL>/auth/v1/callback";

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    try {
      const { token: t } = await loginFn({ data: { password: pass } });
      sessionStorage.setItem(TOKEN_KEY, t);
      setToken(t);
      setPass("");
      toast.success("Admin angemeldet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    if (token) {
      try {
        await logoutFn({ data: { token } });
      } catch {
        /* ignore */
      }
    }
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  function saveCfg() {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    toast.success("Konfiguration gespeichert (lokal im Browser)");
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
            <DialogTitle>Admin Einstellungen</DialogTitle>
            <DialogDescription>
              Verwaltung, Backend-Konfiguration und Datenspeicher.
            </DialogDescription>
          </DialogHeader>

          {!token ? (
            <form onSubmit={doLogin} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ap">Admin Passwort</Label>
                <Input
                  id="ap"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="off"
                  placeholder="Standard: admin:root"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loggingIn}>
                {loggingIn ? "Wird geprüft…" : "Anmelden"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Standardpasswort beim ersten Login: <code>admin:root</code> — bitte sofort ändern.
              </p>
            </form>
          ) : (
            <Tabs defaultValue="users">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="users">Nutzer</TabsTrigger>
                <TabsTrigger value="storage">Speicher</TabsTrigger>
                <TabsTrigger value="password">Passwort</TabsTrigger>
                <TabsTrigger value="backend">Backend</TabsTrigger>
                <TabsTrigger value="google">Google</TabsTrigger>
              </TabsList>

              <TabsContent value="users" className="pt-4">
                <UsersPanel
                  listFn={listFn}
                  getUserFn={getUserFn}
                  delUserFn={delUserFn}
                  banFn={banFn}
                  resetFn={resetFn}
                  token={token}
                  onAuthLost={logout}
                />
              </TabsContent>

              <TabsContent value="storage" className="pt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Wo werden Lorebooks und User Cards gespeichert?
                </p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                    <input
                      type="radio"
                      name="sm"
                      checked={storageMode === "cloud"}
                      onChange={() => {
                        setStorageMode("cloud");
                        setStorageModeState("cloud");
                        toast.success("Cloud-Speicher aktiv");
                      }}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-sm">Cloud (Backend)</div>
                      <div className="text-xs text-muted-foreground">
                        Daten werden im Backend gespeichert, synchronisieren zwischen Geräten,
                        erfordern Login.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                    <input
                      type="radio"
                      name="sm"
                      checked={storageMode === "local"}
                      onChange={() => {
                        setStorageMode("local");
                        setStorageModeState("local");
                        toast.success("Lokaler Speicher aktiv");
                      }}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium text-sm">Nur lokal (Browser)</div>
                      <div className="text-xs text-muted-foreground">
                        Daten bleiben in diesem Browser (localStorage). Kein Server-Upload,
                        keine Synchronisation, kein Login nötig. Über JSON-Export/Import
                        zwischen Geräten übertragbar.
                      </div>
                    </div>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aktuelle Auswahl: <code>{storageMode}</code>. Bestehende Daten im jeweils
                  anderen Speicher bleiben erhalten, werden aber erst nach Umschalten wieder
                  angezeigt.
                </p>
              </TabsContent>

              <TabsContent value="password" className="pt-4 space-y-3">
                <PasswordPanel token={token} changeFn={changePassFn} />
              </TabsContent>

              <TabsContent value="backend" className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">
                  Nach dem Export auf deinen Server: trage hier die Verbindungsdaten deiner
                  eigenen Supabase-Instanz ein. Diese Werte musst du außerdem in deiner
                  <code> .env</code> (<code>VITE_SUPABASE_URL</code>,
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
                  <Label>Zusätzliche Redirect URLs</Label>
                  <Textarea
                    rows={2}
                    placeholder="https://meine-domain.de/**, http://localhost:3000/**"
                    value={cfg.redirectUrls}
                    onChange={(e) => setCfg({ ...cfg, redirectUrls: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={saveCfg}>Speichern</Button>
                </div>
              </TabsContent>

              <TabsContent value="google" className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">
                  Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client
                  ID erstellen. Diese Callback-URL als „Authorized redirect URI" eintragen:
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
                  Diese Werte müssen anschließend im eigenen Supabase-Projekt unter
                  <em> Authentication → Providers → Google</em> hinterlegt werden.
                </p>
                <div className="flex justify-end">
                  <Button onClick={saveCfg}>Speichern</Button>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {token && (
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

function UsersPanel({
  token,
  listFn,
  getUserFn,
  delUserFn,
  banFn,
  resetFn,
  onAuthLost,
}: {
  token: string;
  listFn: ReturnType<typeof useServerFn<typeof adminListUsers>>;
  getUserFn: ReturnType<typeof useServerFn<typeof adminGetUser>>;
  delUserFn: ReturnType<typeof useServerFn<typeof adminDeleteUser>>;
  banFn: ReturnType<typeof useServerFn<typeof adminBanUser>>;
  resetFn: ReturnType<typeof useServerFn<typeof adminSendPasswordReset>>;
  onAuthLost: () => void;
}) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, UserDetails | "loading">>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listFn({ data: { token } });
      setUsers(list as AdminUser[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler";
      toast.error(msg);
      if (msg.toLowerCase().includes("token") || msg.toLowerCase().includes("sitzung")) {
        onAuthLost();
      }
    } finally {
      setLoading(false);
    }
  }, [listFn, token, onAuthLost]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!details[id]) {
      setDetails((d) => ({ ...d, [id]: "loading" }));
      try {
        const det = await getUserFn({ data: { token, userId: id } });
        setDetails((d) => ({ ...d, [id]: det }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Fehler");
        setDetails((d) => {
          const copy = { ...d };
          delete copy[id];
          return copy;
        });
      }
    }
  }

  async function doDelete(u: AdminUser) {
    if (!confirm(`Nutzer ${u.email} und alle Daten endgültig löschen?`)) return;
    try {
      await delUserFn({ data: { token, userId: u.id } });
      toast.success("Nutzer gelöscht");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function doBan(u: AdminUser, ban: boolean) {
    try {
      await banFn({ data: { token, userId: u.id, ban } });
      toast.success(ban ? "Nutzer gesperrt" : "Nutzer entsperrt");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function doReset(u: AdminUser) {
    try {
      await resetFn({
        data: {
          token,
          email: u.email,
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      toast.success("Passwort-Reset-Link generiert / Mail gesendet");
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
          const det = details[u.id];
          return (
            <div key={u.id} className="text-sm">
              <div className="p-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(u.id)}
                  className="flex-1 text-left flex items-center gap-2 min-w-0"
                >
                  {expanded === u.id ? (
                    <ChevronUp className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.email || "(keine E-Mail)"}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.provider} · seit {fmt(u.created_at)}
                      {banned && <span className="ml-2 text-destructive">· gesperrt</span>}
                      {!u.email_confirmed_at && (
                        <span className="ml-2 text-amber-600">· nicht bestätigt</span>
                      )}
                    </div>
                  </div>
                </button>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => doReset(u)} title="Passwort-Reset senden">
                    <Mail className="h-4 w-4" />
                  </Button>
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
              {expanded === u.id && (
                <div className="px-3 pb-3 text-xs space-y-2 bg-muted/30">
                  <div className="grid grid-cols-2 gap-1">
                    <div>ID:</div><div className="font-mono break-all">{u.id}</div>
                    <div>Letzter Login:</div><div>{fmt(u.last_sign_in_at)}</div>
                    <div>E-Mail bestätigt:</div><div>{fmt(u.email_confirmed_at)}</div>
                    <div>Provider:</div><div>{u.provider}</div>
                  </div>
                  {det === "loading" && <div>Lade Details…</div>}
                  {det && det !== "loading" && (
                    <div className="space-y-1 pt-2 border-t">
                      <div className="font-medium">
                        Characters: {det.characters.length}
                      </div>
                      {det.characters.map((c) => (
                        <div key={c.id} className="pl-2 text-muted-foreground truncate">
                          • {c.name}
                        </div>
                      ))}
                      <div className="font-medium pt-1">
                        Lorebooks: {det.lorebooks.length}
                      </div>
                      {det.lorebooks.map((c) => (
                        <div key={c.id} className="pl-2 text-muted-foreground truncate">
                          • {c.name}
                        </div>
                      ))}
                      <div className="font-medium pt-1">
                        User Cards: {det.user_cards.length}
                      </div>
                      {det.user_cards.map((c) => (
                        <div key={c.id} className="pl-2 text-muted-foreground truncate">
                          • {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------- PASSWORD PANEL -----------------

function PasswordPanel({
  token,
  changeFn,
}: {
  token: string;
  changeFn: ReturnType<typeof useServerFn<typeof adminChangePassword>>;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (a.length < 6) return toast.error("Mindestens 6 Zeichen");
    if (a !== b) return toast.error("Passwörter stimmen nicht überein");
    setBusy(true);
    try {
      await changeFn({ data: { token, newPassword: a } });
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
        Das Admin-Passwort wird zentral im Backend gespeichert (gehashed) und gilt
        geräteübergreifend.
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
