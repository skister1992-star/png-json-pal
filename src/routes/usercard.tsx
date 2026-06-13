import { createFileRoute } from "@tanstack/react-router";
import { Toaster, toast } from "sonner";
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SiteHeader, useSession } from "@/components/SiteHeader";
import { Download, Plus, Trash2, Upload, Star, UserCircle } from "lucide-react";

export const Route = createFileRoute("/usercard")({
  ssr: false,
  head: () => ({ meta: [{ title: "UserCard Editor" }] }),
  component: UserCardPage,
});

type PersonaDesc = {
  description: string;
  position: number;
  lorebook: string;
  connections: string[];
  title: string;
};

type PersonasFile = {
  personas: Record<string, string>;
  persona_descriptions: Record<string, PersonaDesc>;
  default_persona: string;
};

function emptyFile(): PersonasFile {
  return { personas: {}, persona_descriptions: {}, default_persona: "" };
}

function emptyDesc(): PersonaDesc {
  return {
    description: "",
    position: 0,
    lorebook: "",
    connections: [],
    title: "",
  };
}

function UserCardPage() {
  const session = useSession();
  const [file, setFile] = useState<PersonasFile>(() => emptyFile());
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const keys = useMemo(() => Object.keys(file.personas), [file]);
  const desc = selected ? file.persona_descriptions[selected] ?? emptyDesc() : null;
  const name = selected ? file.personas[selected] ?? "" : "";

  function setName(key: string, v: string) {
    setFile((f) => ({ ...f, personas: { ...f.personas, [key]: v } }));
  }
  function setDesc(key: string, patch: Partial<PersonaDesc>) {
    setFile((f) => ({
      ...f,
      persona_descriptions: {
        ...f.persona_descriptions,
        [key]: { ...(f.persona_descriptions[key] ?? emptyDesc()), ...patch },
      },
    }));
  }
  function renameKey(oldKey: string, newKey: string) {
    if (!newKey || newKey === oldKey || file.personas[newKey] != null) return;
    setFile((f) => {
      const personas = { ...f.personas };
      const descs = { ...f.persona_descriptions };
      personas[newKey] = personas[oldKey];
      delete personas[oldKey];
      if (descs[oldKey]) {
        descs[newKey] = descs[oldKey];
        delete descs[oldKey];
      }
      return {
        ...f,
        personas,
        persona_descriptions: descs,
        default_persona: f.default_persona === oldKey ? newKey : f.default_persona,
      };
    });
    setSelected(newKey);
  }
  function addPersona() {
    let base = "persona.png";
    let i = 1;
    while (file.personas[base] != null) base = `persona-${i++}.png`;
    setFile((f) => ({
      ...f,
      personas: { ...f.personas, [base]: "Neue Persona" },
      persona_descriptions: {
        ...f.persona_descriptions,
        [base]: emptyDesc(),
      },
      default_persona: f.default_persona || base,
    }));
    setSelected(base);
  }
  function removePersona(key: string) {
    setFile((f) => {
      const personas = { ...f.personas };
      const descs = { ...f.persona_descriptions };
      delete personas[key];
      delete descs[key];
      return {
        ...f,
        personas,
        persona_descriptions: descs,
        default_persona: f.default_persona === key ? "" : f.default_persona,
      };
    });
    if (selected === key) setSelected(null);
  }

  function onImport(f: File) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(String(r.result));
        if (!obj || typeof obj !== "object" || !obj.personas) {
          throw new Error("Ungültiges Format");
        }
        const norm: PersonasFile = {
          personas: obj.personas ?? {},
          persona_descriptions: obj.persona_descriptions ?? {},
          default_persona: obj.default_persona ?? "",
        };
        setFile(norm);
        setSelected(Object.keys(norm.personas)[0] ?? null);
        toast.success("Personas importiert");
      } catch (e) {
        toast.error((e as Error).message);
      }
    };
    r.readAsText(f);
  }

  function onExport() {
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `personas_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors theme="dark" position="top-right" />
      <SiteHeader session={session} />
      <div className="border-b border-border/60 bg-background/60">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-2">
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground mr-2">UserCard Editor</span>
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
                setFile(emptyFile());
                setSelected(null);
              }}
            >
              Neu
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Personas ({keys.length})</span>
            <Button size="sm" variant="outline" onClick={addPersona}>
              <Plus className="h-4 w-4" /> Neu
            </Button>
          </div>
          <ScrollArea className="h-[480px] pr-2">
            <ul className="space-y-1">
              {keys.map((k) => {
                const isDefault = file.default_persona === k;
                return (
                  <li key={k}>
                    <button
                      onClick={() => setSelected(k)}
                      className={`w-full text-left rounded-md px-2 py-2 text-sm border transition-colors ${
                        selected === k
                          ? "bg-accent border-border"
                          : "border-transparent hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isDefault && (
                          <Star className="h-3 w-3 text-primary fill-primary" />
                        )}
                        <span className="font-medium truncate">
                          {file.personas[k] || k}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{k}</div>
                    </button>
                  </li>
                );
              })}
              {keys.length === 0 && (
                <li className="text-xs text-muted-foreground px-2 py-4 text-center">
                  Noch keine Personas
                </li>
              )}
            </ul>
          </ScrollArea>
        </Card>

        <div>
          {selected && desc ? (
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  placeholder="Name"
                  onChange={(e) => setName(selected, e.target.value)}
                  className="text-base font-medium"
                />
                <Button
                  variant={file.default_persona === selected ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    setFile((f) => ({ ...f, default_persona: selected }))
                  }
                >
                  <Star className="h-4 w-4" /> Standard
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removePersona(selected)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div>
                <Label className="text-xs">Datei-Schlüssel (z. B. user-default.png)</Label>
                <Input
                  defaultValue={selected}
                  onBlur={(e) => renameKey(selected, e.target.value.trim())}
                />
              </div>

              <div>
                <Label className="text-xs">Titel</Label>
                <Input
                  value={desc.title}
                  onChange={(e) => setDesc(selected, { title: e.target.value })}
                />
              </div>

              <div>
                <Label className="text-xs">Beschreibung</Label>
                <Textarea
                  rows={6}
                  value={desc.description}
                  onChange={(e) =>
                    setDesc(selected, { description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Position</Label>
                  <Input
                    type="number"
                    value={desc.position}
                    onChange={(e) =>
                      setDesc(selected, { position: Number(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Lorebook</Label>
                  <Input
                    value={desc.lorebook}
                    onChange={(e) =>
                      setDesc(selected, { lorebook: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Connections (komma-getrennt)</Label>
                <Input
                  value={desc.connections.join(", ")}
                  onChange={(e) =>
                    setDesc(selected, {
                      connections: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </Card>
          ) : (
            <Card className="p-12 text-center text-muted-foreground text-sm">
              Wähle eine Persona aus oder erstelle eine neue.
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
