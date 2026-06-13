import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PERSONALITY_GROUPS } from "@/lib/personality-traits";
import { Plus, X } from "lucide-react";

/**
 * Parses quoted traits ("foo", "bar") out of the personality text.
 * Returns the list of traits and the remaining "free" text (non-quoted parts).
 */
function parsePersonality(text: string): { traits: string[]; rest: string } {
  const traits: string[] = [];
  const rest = (text ?? "").replace(/"([^"\n]+)"/g, (_, t) => {
    traits.push(String(t).trim());
    return "";
  });
  return { traits, rest: rest.replace(/\s*,\s*,\s*/g, ", ").replace(/^\s*,\s*|\s*,\s*$/g, "").trim() };
}

function buildPersonality(traits: string[], rest: string): string {
  const quoted = traits.map((t) => `"${t}"`).join(", ");
  if (!rest) return quoted;
  if (!quoted) return rest;
  return `${quoted}\n${rest}`;
}

export function PersonalityTraitPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { traits, rest } = useMemo(() => parsePersonality(value ?? ""), [value]);
  const selected = new Set(traits);
  const [filter, setFilter] = useState("");
  const [customTrait, setCustomTrait] = useState("");

  const toggle = (trait: string) => {
    const next = [...traits];
    const i = next.indexOf(trait);
    if (i >= 0) next.splice(i, 1);
    else next.push(trait);
    onChange(buildPersonality(next, rest));
  };

  const addCustom = () => {
    const t = customTrait.trim();
    if (!t || selected.has(t)) return setCustomTrait("");
    onChange(buildPersonality([...traits, t], rest));
    setCustomTrait("");
  };

  const clearAll = () => onChange(buildPersonality([], rest));

  const filterLower = filter.trim().toLowerCase();
  const groups = useMemo(
    () =>
      PERSONALITY_GROUPS.map((g) => ({
        ...g,
        traits: filterLower
          ? g.traits.filter((t) => t.toLowerCase().includes(filterLower))
          : g.traits,
      })).filter((g) => g.traits.length > 0),
    [filterLower],
  );

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">
          Eigenschaften ({traits.length})
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
          placeholder="Eigenschaften suchen…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 text-sm"
        />
        <Input
          placeholder="Eigene hinzufügen"
          value={customTrait}
          onChange={(e) => setCustomTrait(e.target.value)}
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
        {groups.map((g) => {
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
    </div>
  );
}
