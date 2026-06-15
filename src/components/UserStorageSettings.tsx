import { useEffect, useState } from "react";
import { Database } from "lucide-react";
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
  type StorageMode,
  type CustomCloudConfig,
} from "@/lib/storage-mode";
import { clearCustomSupabaseCache, getCustomSupabase } from "@/lib/custom-supabase";

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
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!open) return;
    setMode(getStorageMode());
    setCfg(getCustomCloudConfig());
  }, [open]);

  if (!session) return null;

  function applyMode(m: StorageMode) {
    setMode(m);
    setStorageMode(m);
    toast.success(
      m === "local" ? "Lokaler Speicher aktiv" : "Eigene Cloud aktiv",
    );
  }

  function saveCustom() {
    setCustomCloudConfig(cfg);
    clearCustomSupabaseCache();
    toast.success("Eigene Cloud gespeichert");
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
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Speicherort wählen</DialogTitle>
            <DialogDescription>
              Lege fest, wo deine Lorebooks und User Cards gespeichert werden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <input
                type="radio"
                name="usm"
                className="mt-1"
                checked={mode === "local"}
                onChange={() => applyMode("local")}
              />
              <div>
                <div className="font-medium text-sm">Lokal im Browser</div>
                <div className="text-xs text-muted-foreground">
                  Daten bleiben nur in diesem Browser. Kein Upload, kein Sync. Über JSON-Export
                  zwischen Geräten übertragbar.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <input
                type="radio"
                name="usm"
                className="mt-1"
                checked={mode === "custom"}
                onChange={() => applyMode("custom")}
              />
              <div className="flex-1">
                <div className="font-medium text-sm">Eigene Cloud (eigenes Supabase-Projekt)</div>
                <div className="text-xs text-muted-foreground">
                  Verbinde dein eigenes Supabase-Projekt. Es muss die Tabellen{" "}
                  <code>lorebooks</code> und <code>user_cards</code> mit denselben Spalten haben
                  (kann durch Export dieser App eingerichtet werden).
                </div>
              </div>
            </label>

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
                <div className="space-y-1">
                  <Label>E-Mail (Login auf deiner Cloud)</Label>
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
                  <p className="text-[11px] text-muted-foreground">
                    Wird nur in diesem Browser gespeichert, damit dein eigener Supabase-Client
                    sich automatisch anmelden kann.
                  </p>
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
