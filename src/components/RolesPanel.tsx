// Admin-only panel for managing per-user roles (approved / admin).
// Uses Supabase RPCs:
//   - admin_list_users()    -> list with roles (admin-only, server-enforced)
//   - admin_set_role()      -> grant/revoke a role (admin-only, server-enforced)
//   - admin_claim_initial() -> bootstrap: first user becomes admin

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMyRoles, type AppRole } from "@/lib/cloud-providers";
import { useSession } from "@/components/SiteHeader";

type AdminUser = {
  id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  roles: AppRole[];
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export function RolesPanel() {
  const session = useSession();
  const [myRoles, setMyRoles] = useState<AppRole[]>([]);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const isAdmin = myRoles.includes("admin");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getMyRoles();
      setMyRoles(r);
      if (r.includes("admin")) {
        const { data, error } = await supabase.rpc("admin_list_users");
        if (error) throw new Error(error.message);
        setUsers((data ?? []) as AdminUser[]);
      } else {
        setUsers(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function claimInitialAdmin() {
    setClaiming(true);
    try {
      const { data, error } = await supabase.rpc("admin_claim_initial");
      if (error) throw new Error(error.message);
      if (data) {
        toast.success("Du bist jetzt Admin.");
        void refresh();
      } else {
        toast.error("Es gibt bereits einen Admin.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setClaiming(false);
    }
  }

  async function toggleRole(u: AdminUser, role: AppRole) {
    const hasRole = u.roles.includes(role);
    try {
      const { error } = await supabase.rpc("admin_set_role", {
        _user_id: u.id,
        _role: role,
        _grant: !hasRole,
      });
      if (error) throw new Error(error.message);
      toast.success(
        hasRole ? `Rolle "${role}" entzogen` : `Rolle "${role}" vergeben`,
      );
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  if (!session) {
    return (
      <p className="text-sm text-muted-foreground">
        Bitte zuerst mit Google anmelden, um Rollen zu verwalten.
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Du hast keine Admin-Rolle. Falls noch <strong>kein</strong> Admin existiert,
          kannst du dich hier selbst als ersten Admin eintragen.
        </p>
        <Button onClick={claimInitialAdmin} disabled={claiming}>
          <ShieldCheck className="h-4 w-4" />
          {claiming ? "Prüfe…" : "Als ersten Admin beanspruchen"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Funktioniert nur, wenn aktuell keinerlei Admin gesetzt ist.
        </p>
      </div>
    );
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
          const approved = u.roles.includes("approved");
          const admin = u.roles.includes("admin");
          return (
            <div key={u.id} className="p-3 text-sm flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {u.email ?? "(kein E-Mail)"}
                  {admin && (
                    <span className="text-[10px] uppercase rounded bg-amber-500/15 text-amber-700 px-1.5 py-0.5">
                      admin
                    </span>
                  )}
                  {approved && (
                    <span className="text-[10px] uppercase rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5">
                      approved
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  seit {fmt(u.created_at)} · letzter Login {fmt(u.last_sign_in_at)}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={approved ? "secondary" : "default"}
                  onClick={() => toggleRole(u, "approved")}
                  title={approved ? "Server-Speicher entziehen" : "Server-Speicher freigeben"}
                >
                  {approved ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  {approved ? "Sperren" : "Freigeben"}
                </Button>
                <Button
                  size="sm"
                  variant={admin ? "secondary" : "outline"}
                  onClick={() => toggleRole(u, "admin")}
                  title={admin ? "Admin entziehen" : "Admin machen"}
                >
                  {admin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {admin ? "Admin entziehen" : "Admin"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        <strong>approved</strong>: darf Daten in der Lovable Cloud (Server) speichern.
        <strong className="ml-2">admin</strong>: darf Rollen verwalten.
      </p>
    </div>
  );
}
