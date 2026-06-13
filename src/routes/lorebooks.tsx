import { createFileRoute } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SiteHeader, useSession } from "@/components/SiteHeader";
import { Download, Plus, Trash2, Upload, FileJson } from "lucide-react";
import {
  emptyLorebook,
  newEntry,
  nextUid,
  type Lorebook,
  type LorebookEntry,
} from "@/lib/lorebook";
import { CloudDocsMenu } from "@/components/CloudDocsMenu";

export const Route = createFileRoute("/lorebooks")({
  ssr: false,
  head: () => ({ meta: [{ title: "Lorebook Editor" }] }),
  component: LorebooksPage,
});

const POSITIONS: { value: number; label: string }[] = [
  { value: 0, label: "Vor Char-Def" },
  { value: 1, label: "Nach Char-Def" },
  { value: 2, label: "Vor AN" },
  { value: 3, label: "Nach AN" },
  { value: 4, label: "@ Depth" },
];

function LorebooksPage() {
  const session = useSession();
  const [book, setBook] = useState<Lorebook>(() => emptyLorebook());
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(
    () =>
      Object.values(book.entries).sort(
        (a, b) => (a.displayIndex ?? 0) - (b.displayIndex ?? 0),
      ),
    [book],
  );
  const selected = selectedUid != null ? book.entries[String(selectedUid)] : null;

  function updateMeta<K extends keyof Lorebook>(k: K, v: Lorebook[K]) {
    setBook((b) => ({ ...b, [k]: v }));
  }

  function updateEntry(uid: number, patch: Partial<LorebookEntry>) {
    setBook((b) => {
      const key = String(uid);
      const cur = b.entries[key];
      if (!cur) return b;
      return { ...b, entries: { ...b.entries, [key]: { ...cur, ...patch } } };
    });
  }

  function addEntry() {
    setBook((b) => {
      const uid = nextUid(b);
      const e = newEntry(uid);
      e.displayIndex = Object.keys(b.entries).length;
      setSelectedUid(uid);
      return { ...b, entries: { ...b.entries, [String(uid)]: e } };
    });
  }

  function removeEntry(uid: number) {
    setBook((b) => {
      const next = { ...b.entries };
      delete next[String(uid)];
      return { ...b, entries: next };
    });
    if (selectedUid === uid) setSelectedUid(null);
  }

  function onImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== "object" || !obj.entries) {
          throw new Error("Ungültiges Lorebook-Format");
        }
        setBook(obj as Lorebook);
        setSelectedUid(null);
        toast.success("Lorebook importiert");
      } catch (e) {
        toast.error((e as Error).message);
      }
    };
    reader.readAsText(file);
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(book, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${book.name || "lorebook"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors theme="dark" position="top-right" />
      <SiteHeader session={session} />
      <div className="border-b border-border/60 bg-background/60">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground mr-2">Lorebook Editor</span>
          <div className="ml-auto flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBook(emptyLorebook());
                setSelectedUid(null);
              }}
            >
              Neu
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={book.name}
                onChange={(e) => updateMeta("name", e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Beschreibung</Label>
              <Textarea
                rows={2}
                value={book.description}
                onChange={(e) => updateMeta("description", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Scan Depth</Label>
                <Input
                  type="number"
                  value={book.scan_depth}
                  onChange={(e) =>
                    updateMeta("scan_depth", Number(e.target.value) || 0)
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Token Budget</Label>
                <Input
                  type="number"
                  value={book.token_budget}
                  onChange={(e) =>
                    updateMeta("token_budget", Number(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Recursive Scanning</Label>
              <Switch
                checked={book.recursive_scanning}
                onCheckedChange={(v) => updateMeta("recursive_scanning", v)}
              />
            </div>
          </Card>

          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Einträge ({entries.length})
              </span>
              <Button size="sm" variant="outline" onClick={addEntry}>
                <Plus className="h-4 w-4" /> Neu
              </Button>
            </div>
            <ScrollArea className="h-[420px] pr-2">
              <ul className="space-y-1">
                {entries.map((e) => (
                  <li key={e.uid}>
                    <button
                      onClick={() => setSelectedUid(e.uid)}
                      className={`w-full text-left rounded-md px-2 py-2 text-sm border transition-colors ${
                        selectedUid === e.uid
                          ? "bg-accent border-border"
                          : "border-transparent hover:bg-accent/50"
                      } ${e.disable ? "opacity-50" : ""}`}
                    >
                      <div className="font-medium truncate">
                        {e.comment || e.name || e.key?.[0] || `Eintrag #${e.uid}`}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {(e.key || []).join(", ") || "— keine Keys —"}
                      </div>
                    </button>
                  </li>
                ))}
                {entries.length === 0 && (
                  <li className="text-xs text-muted-foreground px-2 py-4 text-center">
                    Noch keine Einträge
                  </li>
                )}
              </ul>
            </ScrollArea>
          </Card>
        </div>

        {/* Editor */}
        <div>
          {selected ? (
            <EntryEditor
              entry={selected}
              onChange={(p) => updateEntry(selected.uid, p)}
              onDelete={() => removeEntry(selected.uid)}
            />
          ) : (
            <Card className="p-12 text-center text-muted-foreground text-sm">
              Wähle einen Eintrag aus oder erstelle einen neuen.
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function KeyList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const text = (value || []).join(", ");
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={text}
        placeholder="komma, getrennt"
        onChange={(e) =>
          onChange(
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    </div>
  );
}

function EntryEditor({
  entry,
  onChange,
  onDelete,
}: {
  entry: LorebookEntry;
  onChange: (p: Partial<LorebookEntry>) => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={entry.comment}
          placeholder="Titel / Memo"
          onChange={(e) => onChange({ comment: e.target.value })}
          className="text-base font-medium"
        />
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Löschen
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <KeyList
          label="Primäre Keys"
          value={entry.key}
          onChange={(v) => onChange({ key: v, keys: v } as Partial<LorebookEntry>)}
        />
        <KeyList
          label="Sekundäre Keys"
          value={entry.keysecondary}
          onChange={(v) =>
            onChange({
              keysecondary: v,
              secondary_keys: v,
            } as Partial<LorebookEntry>)
          }
        />
      </div>

      <div>
        <Label className="text-xs">Inhalt</Label>
        <Textarea
          rows={12}
          value={entry.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className="font-mono text-sm"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">Position</Label>
          <Select
            value={String(entry.position)}
            onValueChange={(v) => onChange({ position: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POSITIONS.map((p) => (
                <SelectItem key={p.value} value={String(p.value)}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Depth</Label>
          <Input
            type="number"
            value={entry.depth ?? 4}
            onChange={(e) => onChange({ depth: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Order</Label>
          <Input
            type="number"
            value={entry.order ?? 100}
            onChange={(e) => onChange({ order: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Probability %</Label>
          <Input
            type="number"
            value={entry.probability ?? 100}
            onChange={(e) =>
              onChange({ probability: Number(e.target.value) || 0 })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
        <Toggle
          label="Aktiv"
          checked={!entry.disable}
          onChange={(v) => onChange({ disable: !v })}
        />
        <Toggle
          label="Constant"
          checked={entry.constant}
          onChange={(v) => onChange({ constant: v })}
        />
        <Toggle
          label="Selective"
          checked={entry.selective}
          onChange={(v) => onChange({ selective: v })}
        />
        <Toggle
          label="Exclude Recursion"
          checked={entry.excludeRecursion}
          onChange={(v) => onChange({ excludeRecursion: v })}
        />
      </div>
    </Card>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
