import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { extractCharaJson, embedCharaJson } from "@/lib/png-chara";
import { TraitPicker, extractBracket, upsertBracket } from "@/components/TraitPicker";
import { ClothingPicker } from "@/components/ClothingPicker";
import { PERSONALITY_GROUPS } from "@/lib/personality-traits";
import { APPEARANCE_GROUPS } from "@/lib/appearance-traits";
import { Download, Upload, FileJson, ImageIcon, Plus, Trash2, Save, LogOut, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import {
  listCharacters, saveCharacter, deleteCharacter, downloadImage, type CharacterRow,
} from "@/lib/character-store";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Character Card Editor — PNG + JSON" },
      { name: "description", content: "Edit SillyTavern character cards. Load PNG with embedded JSON or a JSON file, modify fields, export back to PNG or JSON." },
      { property: "og:title", content: "Character Card Editor" },
      { property: "og:description", content: "Edit PNG + JSON character cards in the browser." },
    ],
  }),
  component: Page,
});

function Page() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);
  return <Editor session={session} />;
}

async function signInWithGoogle() {
  const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  if (res.error) toast.error(res.error.message ?? "Login fehlgeschlagen");
}


function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) { toast.error(res.error.message ?? "Login fehlgeschlagen"); setBusy(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center bg-background text-foreground p-6">
      <Toaster richColors theme="dark" position="top-right" />
      <Card className="p-8 max-w-sm w-full text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground font-bold text-2xl">C</div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Character Card Editor</h1>
          <p className="text-sm text-muted-foreground mt-1">Melde dich an, um deine Charaktere zu speichern und fortzusetzen.</p>
        </div>
        <Button className="w-full" onClick={signIn} disabled={busy}>
          {busy ? "Weiterleiten…" : "Mit Google anmelden"}
        </Button>
      </Card>
    </div>
  );
}

type AnyObj = Record<string, any>;

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Editor() {
  const [card, setCard] = useState<AnyObj | null>(null);
  const [pngBytes, setPngBytes] = useState<Uint8Array | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("character");
  const [charId, setCharId] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterRow[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try { setCharacters(await listCharacters()); } catch (e: any) { toast.error(e.message); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const save = async () => {
    if (!card) return;
    setSaving(true);
    try {
      const row = await saveCharacter({
        id: charId ?? undefined,
        name: (card.data?.name ?? card.name ?? fileName) || "Unnamed",
        data: card,
        png: pngBytes,
      });
      setCharId(row.id);
      toast.success("Gespeichert");
      await refresh();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const loadFromDb = async (row: CharacterRow) => {
    setCard(row.data);
    setCharId(row.id);
    setFileName(row.name);
    if (row.image_path) {
      try {
        const bytes = await downloadImage(row.image_path);
        setPngBytes(bytes);
        setImageUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/png" })));
      } catch { setPngBytes(null); setImageUrl(null); }
    } else { setPngBytes(null); setImageUrl(null); }
    toast.success(`"${row.name}" geladen`);
  };

  const removeFromDb = async (row: CharacterRow) => {
    if (!confirm(`"${row.name}" löschen?`)) return;
    try {
      await deleteCharacter(row);
      if (charId === row.id) setCharId(null);
      toast.success("Gelöscht");
      await refresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const signOut = async () => { await supabase.auth.signOut(); };



  const data: AnyObj = useMemo(() => (card?.data ?? card ?? {}) as AnyObj, [card]);

  const update = useCallback((path: string[], value: any) => {
    setCard((prev) => {
      if (!prev) return prev;
      const next: AnyObj = JSON.parse(JSON.stringify(prev));
      // Update top-level (v1/v2 fields) AND data.* (v3) so both stay in sync.
      const setIn = (obj: AnyObj, p: string[]) => {
        let cur = obj;
        for (let i = 0; i < p.length - 1; i++) {
          cur[p[i]] = cur[p[i]] ?? {};
          cur = cur[p[i]];
        }
        cur[p[p.length - 1]] = value;
      };
      setIn(next, path);
      if (next.data && path[0] !== "data") setIn(next.data, path);
      return next;
    });
  }, []);

  const updateBookEntry = (idx: number, key: string, value: any) => {
    setCard((prev) => {
      if (!prev) return prev;
      const next: AnyObj = JSON.parse(JSON.stringify(prev));
      const book = next.data?.character_book ?? next.character_book;
      if (!book?.entries?.[idx]) return prev;
      book.entries[idx][key] = value;
      return next;
    });
  };

  const addBookEntry = () => {
    setCard((prev) => {
      if (!prev) return prev;
      const next: AnyObj = JSON.parse(JSON.stringify(prev));
      next.data = next.data ?? {};
      next.data.character_book = next.data.character_book ?? { entries: [] };
      const entries = next.data.character_book.entries as any[];
      entries.push({
        id: entries.length,
        keys: [],
        secondary_keys: [],
        comment: "New entry",
        content: "",
        constant: false,
        selective: true,
        insertion_order: 100,
        enabled: true,
        position: "before_char",
        extensions: {},
      });
      return next;
    });
  };

  const removeBookEntry = (idx: number) => {
    setCard((prev) => {
      if (!prev) return prev;
      const next: AnyObj = JSON.parse(JSON.stringify(prev));
      const book = next.data?.character_book ?? next.character_book;
      if (book?.entries) book.entries.splice(idx, 1);
      return next;
    });
  };

  const handleFile = async (file: File) => {
    setFileName(file.name.replace(/\.(png|json)$/i, ""));
    if (file.name.toLowerCase().endsWith(".json")) {
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        setCard(parsed);
        setPngBytes(null);
        setImageUrl(null);
        toast.success("JSON loaded");
      } catch {
        toast.error("Invalid JSON");
      }
      return;
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    try {
      const json = extractCharaJson(buf);
      setPngBytes(buf);
      setImageUrl(URL.createObjectURL(new Blob([buf as BlobPart], { type: "image/png" })));
      if (json) {
        setCard(json as AnyObj);
        toast.success("PNG + embedded character loaded");
      } else {
        setCard({ name: "", description: "", first_mes: "", data: { name: "", description: "", first_mes: "" } });
        toast.message("PNG loaded — no character data found, starting fresh");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to read PNG");
    }
  };

  const replaceImage = async (file: File) => {
    const buf = new Uint8Array(await file.arrayBuffer());
    setPngBytes(buf);
    setImageUrl(URL.createObjectURL(new Blob([buf as BlobPart], { type: "image/png" })));
    toast.success("Image replaced");
  };

  const exportJson = () => {
    if (!card) return;
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: "application/json" });
    downloadBlob(blob, `${fileName}.json`);
  };

  const exportPng = () => {
    if (!card || !pngBytes) {
      toast.error("Load a PNG image first");
      return;
    }
    const out = embedCharaJson(pngBytes, card);
    downloadBlob(new Blob([out as BlobPart], { type: "image/png" }), `${fileName}.png`);
  };

  const newCard = () => {
    setCard({
      spec: "chara_card_v3",
      spec_version: "3.0",
      name: "New Character",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      data: {
        name: "New Character",
        description: "",
        personality: "",
        scenario: "",
        first_mes: "",
        mes_example: "",
        creator: "",
        creator_notes: "",
        character_version: "1.0.0",
        tags: [],
        alternate_greetings: [],
        extensions: {},
        character_book: { entries: [] },
      },
    });
    setPngBytes(null);
    setImageUrl(null);
    setFileName("character");
  };

  const book = (data.character_book?.entries as any[] | undefined) ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors theme="dark" position="top-right" />
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-10 bg-background/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground font-bold">
              C
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Character Card Editor</h1>
              <p className="text-xs text-muted-foreground">PNG · JSON · SillyTavern v2 / v3</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".png,.json,image/png,application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Load
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setCharId(null); newCard(); }}>New</Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="default" size="sm" onClick={save} disabled={!card || saving}>
              <Save className="h-4 w-4" /> {saving ? "Speichert…" : charId ? "Speichern" : "In Cloud speichern"}
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="outline" size="sm" onClick={exportJson} disabled={!card}>
              <FileJson className="h-4 w-4" /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={exportPng} disabled={!card || !pngBytes}>
              <Download className="h-4 w-4" /> PNG
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button variant="ghost" size="sm" onClick={signOut} title="Abmelden">
              <LogOut className="h-4 w-4" />
            </Button>

          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <aside className="space-y-4">
            {card && (
              <>
                <Card className="overflow-hidden p-0">
                  <div className="aspect-[2/3] bg-muted relative">
                    {imageUrl ? (
                      <img src={imageUrl} alt="card" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">
                        <div className="text-center">
                          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          No image
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <input
                      ref={imgRef}
                      type="file"
                      accept="image/png"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && replaceImage(e.target.files[0])}
                    />
                    <Button variant="outline" size="sm" className="w-full" onClick={() => imgRef.current?.click()}>
                      <ImageIcon className="h-4 w-4" /> {pngBytes ? "Replace image" : "Add PNG"}
                    </Button>
                    <div className="text-xs text-muted-foreground text-center truncate">{fileName}</div>
                  </div>
                </Card>
                <Card className="p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Spec</span><Badge variant="secondary">{card.spec ?? "v1"}</Badge></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Book entries</span><span>{book.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tags</span><span>{(data.tags ?? []).length}</span></div>
                </Card>
              </>
            )}
            <Card className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1"><FolderOpen className="h-3 w-3" /> Meine Charaktere</Label>
                <span className="text-xs text-muted-foreground">{characters.length}</span>
              </div>
              {characters.length === 0 ? (
                <p className="text-xs text-muted-foreground">Noch keine gespeichert.</p>
              ) : (
                <ul className="space-y-1 max-h-80 overflow-auto -mx-1">
                  {characters.map((c) => (
                    <li key={c.id} className={`group flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-accent ${charId === c.id ? "bg-accent" : ""}`}>
                      <button className="flex-1 text-left truncate" onClick={() => loadFromDb(c)} title={c.name}>
                        {c.name || "Unnamed"}
                      </button>
                      <button className="opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeFromDb(c)} title="Löschen">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>

          <section>
            {!card ? (
              <EmptyState onPick={() => fileRef.current?.click()} onNew={newCard} />
            ) : (
              <>


              <div className="mb-4">
                <Label className="text-xs text-muted-foreground">File name</Label>
                <Input value={fileName} onChange={(e) => setFileName(e.target.value)} className="mt-1" />
              </div>

              <Tabs defaultValue="core">
                <TabsList>
                  <TabsTrigger value="core">Core</TabsTrigger>
                  <TabsTrigger value="meta">Metadata</TabsTrigger>
                  <TabsTrigger value="book">Lorebook ({book.length})</TabsTrigger>
                  <TabsTrigger value="raw">Raw JSON</TabsTrigger>
                </TabsList>

                <TabsContent value="core" className="space-y-4 mt-4">
                  <Field label="Name" value={data.name} onChange={(v) => update(["name"], v)} />
                  <Field
                    label="Description"
                    value={data.description}
                    onChange={(v) => update(["description"], v)}
                    multiline rows={8}
                  />
                  <div className="space-y-2">
                    <Field
                      label="Personality"
                      value={data.personality}
                      onChange={(v) => update(["personality"], v)}
                      multiline rows={3}
                    />
                    <TraitPicker
                      title="Eigenschaften (Personality)"
                      prefixWord="Personality"
                      characterName={data.name ?? ""}
                      value={data.personality ?? ""}
                      onChange={(v) => update(["personality"], v)}
                      groups={PERSONALITY_GROUPS}
                    />
                    <TraitPicker
                      title="Aussehen (body)"
                      prefixWord="body"
                      characterName={data.name ?? ""}
                      value={data.personality ?? ""}
                      onChange={(v) => update(["personality"], v)}
                      groups={APPEARANCE_GROUPS}
                    />
                    <ClothingPicker
                      characterName={data.name ?? ""}
                      value={data.personality ?? ""}
                      onChange={(v) => update(["personality"], v)}
                    />
                    <BracketTextField
                      label="Geschlecht"
                      prefixWord="Geschlecht"
                      characterName={data.name ?? ""}
                      value={data.personality ?? ""}
                      onChange={(v) => update(["personality"], v)}
                    />
                    <BracketTextField
                      label="Alter"
                      prefixWord="Alter"
                      characterName={data.name ?? ""}
                      value={data.personality ?? ""}
                      onChange={(v) => update(["personality"], v)}
                    />
                  </div>
                  <Field
                    label="Scenario"
                    value={data.scenario}
                    onChange={(v) => update(["scenario"], v)}
                    multiline rows={3}
                  />
                  <Field
                    label="First message"
                    value={data.first_mes}
                    onChange={(v) => update(["first_mes"], v)}
                    multiline rows={6}
                  />
                  <Field
                    label="Example messages"
                    value={data.mes_example}
                    onChange={(v) => update(["mes_example"], v)}
                    multiline rows={4}
                  />
                </TabsContent>

                <TabsContent value="meta" className="space-y-4 mt-4">
                  <Field label="Creator" value={data.creator} onChange={(v) => update(["data", "creator"], v)} />
                  <Field label="Character version" value={data.character_version} onChange={(v) => update(["data", "character_version"], v)} />
                  <Field label="Creator notes" value={data.creator_notes ?? card.creatorcomment} onChange={(v) => { update(["data", "creator_notes"], v); update(["creatorcomment"], v); }} multiline rows={3} />
                  <Field label="System prompt" value={data.system_prompt} onChange={(v) => update(["data", "system_prompt"], v)} multiline rows={3} />
                  <Field label="Post-history instructions" value={data.post_history_instructions} onChange={(v) => update(["data", "post_history_instructions"], v)} multiline rows={3} />
                  <div>
                    <Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
                    <Input
                      className="mt-1"
                      value={(data.tags ?? []).join(", ")}
                      onChange={(e) => update(["data", "tags"], e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="book" className="space-y-3 mt-4">
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={addBookEntry}>
                      <Plus className="h-4 w-4" /> Add entry
                    </Button>
                  </div>
                  {book.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">No lorebook entries.</p>
                  )}
                  {book.map((entry, idx) => (
                    <Card key={idx} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={entry.comment ?? ""}
                          onChange={(e) => updateBookEntry(idx, "comment", e.target.value)}
                          placeholder="Entry name / comment"
                          className="font-medium"
                        />
                        <Button size="icon" variant="ghost" onClick={() => removeBookEntry(idx)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Keys</Label>
                        <Input
                          className="mt-1"
                          value={(entry.keys ?? []).join(", ")}
                          onChange={(e) => updateBookEntry(idx, "keys", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                          placeholder="trigger1, trigger2"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Content</Label>
                        <Textarea
                          className="mt-1 font-mono text-xs"
                          rows={6}
                          value={entry.content ?? ""}
                          onChange={(e) => updateBookEntry(idx, "content", e.target.value)}
                        />
                      </div>
                      <div className="flex gap-4 text-xs">
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={!!entry.enabled} onChange={(e) => updateBookEntry(idx, "enabled", e.target.checked)} />
                          Enabled
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={!!entry.constant} onChange={(e) => updateBookEntry(idx, "constant", e.target.checked)} />
                          Constant
                        </label>
                        <label className="flex items-center gap-1">
                          Order
                          <Input
                            type="number"
                            value={entry.insertion_order ?? 100}
                            onChange={(e) => updateBookEntry(idx, "insertion_order", Number(e.target.value))}
                            className="h-6 w-16"
                          />
                        </label>
                      </div>
                    </Card>
                  ))}
                </TabsContent>

                <TabsContent value="raw" className="mt-4">
                  <RawEditor card={card} onChange={setCard} />
                </TabsContent>
              </Tabs>
              </>
            )}
          </section>
        </div>
      </main>
    </div>

  );
}

function Field({
  label, value, onChange, multiline, rows = 3,
}: { label: string; value: any; onChange: (v: string) => void; multiline?: boolean; rows?: number }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {multiline ? (
        <Textarea
          className="mt-1 font-mono text-sm"
          rows={rows}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input className="mt-1" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function BracketTextField({
  label, prefixWord, characterName, value, onChange,
}: {
  label: string; prefixWord: string; characterName: string;
  value: string; onChange: (v: string) => void;
}) {
  const { traits } = extractBracket(value ?? "", prefixWord);
  const current = traits[0] ?? "";
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="mt-1"
        value={current}
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(upsertBracket(value ?? "", prefixWord, characterName, v ? [v] : []));
        }}
      />
    </div>
  );
}

function RawEditor({ card, onChange }: { card: AnyObj; onChange: (c: AnyObj) => void }) {
  const [text, setText] = useState(() => JSON.stringify(card, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Textarea
        rows={24}
        className="font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button
        size="sm"
        onClick={() => {
          try {
            onChange(JSON.parse(text));
            setErr(null);
            toast.success("JSON applied");
          } catch (e: any) {
            setErr(e.message);
          }
        }}
      >
        Apply JSON
      </Button>
    </div>
  );
}

function EmptyState({ onPick, onNew }: { onPick: () => void; onNew: () => void }) {
  return (
    <div className="text-center py-24">
      <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/50 items-center justify-center mb-6">
        <Upload className="h-7 w-7 text-primary-foreground" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Edit a character card</h2>
      <p className="text-muted-foreground mt-2 max-w-md mx-auto">
        Load a PNG with embedded character data or a JSON file. Edit every field, then export back to either format.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={onPick}><Upload className="h-4 w-4" /> Load file</Button>
        <Button variant="outline" onClick={onNew}>Start blank</Button>
      </div>
    </div>
  );
}
