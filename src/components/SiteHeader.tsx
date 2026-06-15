import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

/** Detects whether the Lovable-managed OAuth broker is available for this host. */
function isLovableHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.endsWith(".lovable.app") || h.endsWith(".lovable.dev") || h === "localhost";
}

export async function signInWithGoogle() {
  try {
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (res.error) throw new Error(res.error.message ?? "Login fehlgeschlagen");
    if (res.redirected) return;
  } catch (e: unknown) {
    // Fallback: direct Supabase OAuth (works on self-hosted domains, requires Google
    // provider configured directly in the backend with this domain whitelisted).
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) toast.error(error.message);
    else if (e instanceof Error && e.message) toast.message(e.message);
  }
}

export function LoginDialog({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Konto erstellt. Bitte E-Mail-Postfach prüfen und den Bestätigungslink anklicken, bevor du dich einloggst.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Eingeloggt");
      }
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
            Mit Google oder E-Mail anmelden. E-Mail funktioniert auch beim Self-Hosting auf einer eigenen Domain.
          </DialogDescription>
        </DialogHeader>

        <Button
          variant="outline"
          onClick={async () => {
            await signInWithGoogle();
            setOpen(false);
          }}
        >
          Mit Google fortfahren
        </Button>
        {!isLovableHost() && (
          <p className="text-xs text-muted-foreground -mt-2">
            Hinweis: Google-Login auf eigener Domain erfordert eigene Google-OAuth-Konfiguration im Backend.
          </p>
        )}

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">oder</span>
          </div>
        </div>

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
  session: Session | null;
  rightSlot?: ReactNode;
}) {
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
            <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
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
