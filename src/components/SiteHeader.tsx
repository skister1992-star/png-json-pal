import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import { api, type AppUser } from "@/lib/api-client";

export type AppSession = { user: AppUser } | null;

let cachedSession: AppSession = null;
const listeners = new Set<(s: AppSession) => void>();

function emit(s: AppSession) {
  cachedSession = s;
  for (const l of listeners) l(s);
}

async function refreshSession() {
  const user = await api.me();
  emit(user ? { user } : null);
}

export function useSession(): AppSession {
  const [session, setSession] = useState<AppSession>(cachedSession);
  useEffect(() => {
    listeners.add(setSession);
    void refreshSession();
    return () => {
      listeners.delete(setSession);
    };
  }, []);
  return session;
}

export async function signInWithGoogle() {
  try {
    const cfg = await api.config();
    if (!cfg.google_login_enabled) {
      toast.error("Google-Login ist auf diesem Server nicht konfiguriert.");
      return;
    }
    api.loginWithGoogle(window.location.href);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Google-Login fehlgeschlagen");
  }
}

export function LoginDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.config().then((c) => setGoogleEnabled(c.google_login_enabled)).catch(() => {});
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        await api.register(email, password);
        toast.success("Konto erstellt und angemeldet.");
      } else {
        await api.login(email, password);
        toast.success("Eingeloggt");
      }
      await refreshSession();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="default" size="sm">
            <LogIn className="h-4 w-4" /> Login
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "signin" ? "Anmelden" : "Konto erstellen"}</DialogTitle>
          <DialogDescription>
            Mit E-Mail/Passwort oder Google anmelden. Alle Konten liegen auf deinem eigenen Server.
          </DialogDescription>
        </DialogHeader>

        {googleEnabled && (
          <>
            <Button variant="outline" onClick={signInWithGoogle}>
              Mit Google fortfahren
            </Button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">oder</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Passwort</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {mode === "signin" ? "Einloggen" : "Registrieren"}
          </Button>
          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Noch kein Konto? Registrieren" : "Schon ein Konto? Einloggen"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SiteHeader({
  session,
  rightSlot,
}: {
  session: AppSession;
  rightSlot?: ReactNode;
}) {
  async function doLogout() {
    try {
      await api.logout();
    } catch {
      /* noop */
    }
    await refreshSession();
  }
  return (
    <header className="border-b border-border/60 backdrop-blur sticky top-0 z-10 bg-background/80">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-md bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground font-bold">
            C
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Character Studio</h1>
            <p className="text-xs text-muted-foreground">Cards · Lorebooks · Personas</p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {rightSlot}
          {session ? (
            <Button variant="ghost" size="sm" onClick={doLogout}>
              <LogOut className="h-4 w-4" /> Logout
            </Button>
          ) : (
            <LoginDialog />
          )}
        </div>
      </div>
    </header>
  );
}
