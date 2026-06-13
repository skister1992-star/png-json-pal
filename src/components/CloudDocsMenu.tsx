import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Cloud, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteDoc, listDocs, saveDoc, type DocRow } from "@/lib/doc-store";
import { signInWithGoogle } from "@/components/SiteHeader";
import type { Session } from "@supabase/supabase-js";

type Props<T> = {
  session: Session | null;
  table: "lorebooks" | "user_cards";
  label: string;
  currentId: string | null;
  currentName: string;
  currentData: T;
  onLoad: (row: DocRow) => void;
  onSaved: (row: DocRow) => void;
  onDeleted: (id: string) => void;
};

export function CloudDocsMenu<T>({
  session,
  table,
  label,
  currentId,
  currentName,
  currentData,
  onLoad,
  onSaved,
  onDeleted,
}: Props<T>) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!session) return;
    try {
      setDocs(await listDocs(table));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  async function onSave() {
    if (!session) {
      signInWithGoogle();
      return;
    }
    setBusy(true);
    try {
      const row = await saveDoc(table, currentId, currentName || "Unnamed", currentData);
      toast.success("Gespeichert");
      onSaved(row);
      setDocs((d) => [row, ...d.filter((x) => x.id !== row.id)]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteDoc(table, id);
      setDocs((d) => d.filter((x) => x.id !== id));
      onDeleted(id);
      toast.success("Gelöscht");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!session) {
    return (
      <Button variant="outline" size="sm" onClick={signInWithGoogle}>
        <Cloud className="h-4 w-4" /> Login zum Speichern
      </Button>
    );
  }

  return (
    <>
      <Button variant="default" size="sm" onClick={onSave} disabled={busy}>
        <Cloud className="h-4 w-4" /> {currentId ? "Speichern" : "Cloud speichern"}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <FolderOpen className="h-4 w-4" /> {label} ({docs.length})
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Gespeichert</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {docs.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Noch nichts gespeichert
            </div>
          )}
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-1 px-1 py-0.5"
            >
              <DropdownMenuItem
                className="flex-1"
                onSelect={(e) => {
                  e.preventDefault();
                  onLoad(d);
                }}
              >
                <span className="truncate">{d.name || "Unnamed"}</span>
              </DropdownMenuItem>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDelete(d.id)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
