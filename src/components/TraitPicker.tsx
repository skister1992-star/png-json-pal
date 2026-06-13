import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, X, ChevronDown } from "lucide-react";

export type TraitGroup = { label: string; traits: string[] };

/** Builds `[Name's prefixWord= "a", "b"]` */
export function buildBracket(name: string, prefixWord: string, traits: string[]): string {
  const head = name ? `${name}'s ${prefixWord}` : prefixWord;
  const quoted = traits.map((t) => `"${t}"`).join(", ");
  return quoted ? `[${head}= ${quoted}]` : `[${head}]`;
}

/** Matches `[<anything> prefixWord= "a", "b"]` (also tolerates the old `,` separator). */
function bracketRegex(prefixWord: string): RegExp {
  const w = prefixWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\[[^\\[\\]]*?${w}\\s*[=,]\\s*[^\\[\\]]*\\]`, "is");
}

/** Extracts traits for a given prefix word from arbitrary text. Returns traits + remaining text. */
export function extractBracket(
  text: string,
  prefixWord: string,
): { traits: string[]; rest: string } {
  const src = text ?? "";
  const re = bracketRegex(prefixWord);
  const match = src.match(re);
  const traits: string[] = [];
  if (!match) {
    // Legacy fallback: bare quoted list when prefixWord is "Personality"
    if (/^personality$/i.test(prefixWord)) {
      const trimmed = src.trim();
      if (trimmed && !trimmed.startsWith("[")) {
        const onlyQuoted = trimmed.replace(/"([^"\n]+)"/g, (_, t) => {
          traits.push(String(t).trim());
          return "";
        });
        const leftover = onlyQuoted.replace(/[\s,]+/g, "").trim();
        if (traits.length > 0 && leftover === "") {
          return { traits, rest: "" };
        }
      }
    }
    return { traits: [], rest: src };
  }
  const inner = match[0];
  inner.replace(/"([^"\n]+)"/g, (_, t) => {
    traits.push(String(t).trim());
    return "";
  });
  const rest = (src.slice(0, match.index!) + src.slice(match.index! + match[0].length))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { traits, rest };
}

/** Upsert the bracket section into `text`, preserving everything else. */
export function upsertBracket(
  text: string,
  prefixWord: string,
  name: string,
  traits: string[],
): string {
  const { rest } = extractBracket(text ?? "", prefixWord);
  const bracket = buildBracket(name, prefixWord, traits);
  if (!rest) return bracket;
  return `${rest}\n${bracket}`;
}

export function TraitPicker({
  title,
  prefixWord,
  characterName = "",
  value,
  onChange,
  groups,
  defaultOpen = false,
}: {
  title: string;
  prefixWord: string;
  characterName?: string;
  value: string;
  onChange: (v: string) => void;
  groups: TraitGroup[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { traits } = useMemo(() => extractBracket(value ?? "", prefixWord), [value, prefixWord]);
  const selected = new Set(traits);
  const [filter, setFilter] = useState("");
  const [custom, setCustom] = useState("");

  const commit = (next: string[]) => {
    onChange(upsertBracket(value ?? "", prefixWord, characterName, next));
  };

  const toggle = (trait: string) => {
    const next = [...traits];
    const i = next.indexOf(trait);
    if (i >= 0) next.splice(i, 1);
    else next.push(trait);
    commit(next);
  };

  const addCustom = () => {
    const t = custom.trim();
    if (!t || selected.has(t)) return setCustom("");
    commit([...traits, t]);
    setCustom("");
  };

  const clearAll = () => commit([]);

  const filterLower = filter.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          traits: filterLower
            ? g.traits.filter((t) => t.toLowerCase().includes(filterLower))
            : g.traits,
        }))
        .filter((g) => g.traits.length > 0),
    [filterLower, groups],
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border/60 bg-muted/20">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40 rounded-md cursor-pointer"
        >
          <span className="flex items-center gap-2">
            {title}
            {traits.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {traits.length}
              </Badge>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 px-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Auswahl ({traits.length})
          </div>
          {traits.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-xs">
              Alle entfernen
            </Button>
          )}
        </div>

        {traits.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {traits.map((t, i) => (
              <Badge key={`${t}-${i}`} variant="secondary" className="gap-1 pr-1">
                "{t}"
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  className="rounded-sm hover:bg-background/50 p-0.5"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Suchen…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 text-sm"
          />
          <Input
            placeholder="Eigene hinzufügen"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={addCustom} className="h-8">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Accordion type="multiple" className="w-full">
          {filtered.map((g) => {
            const count = g.traits.filter((t) => selected.has(t)).length;
            return (
              <AccordionItem key={g.label} value={g.label} className="border-border/40">
                <AccordionTrigger className="text-sm py-2 hover:no-underline">
                  <span className="flex items-center gap-2">
                    {g.label}
                    {count > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {count}
                      </Badge>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {g.traits.map((t) => {
                      const isOn = selected.has(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggle(t)}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                            isOn
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border/60 hover:bg-accent hover:text-accent-foreground"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CollapsibleContent>
    </Collapsible>
  );
}
