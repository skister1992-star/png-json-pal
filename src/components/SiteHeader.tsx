import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
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

export async function signInWithGoogle() {
  const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  if (res.error) toast.error(res.error.message ?? "Login fehlgeschlagen");
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
            <Button variant="default" size="sm" onClick={signInWithGoogle}>
              <LogIn className="h-4 w-4" /> Login
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
