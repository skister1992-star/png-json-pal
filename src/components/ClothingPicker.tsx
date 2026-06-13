import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Plus, X } from "lucide-react";
import { extractBracket, upsertBracket } from "@/components/TraitPicker";
import { CLOTHING_GROUPS, CLOTHING_COLORS } from "@/lib/clothing";

/**
 * Adds clothing entries to the body bracket in the form `"<color> <item>"`,
 * e.g. `"rot T-Shirt"`. The body bracket is shared with the appearance picker.
 */
export function ClothingPicker({
  characterName = "",
  value,
  onChange,
  defaultOpen = false,
}: {
  characterName?: string;
  value: string;
  onChange: (v: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { traits } = useMemo(() => extractBracket(value ?? "", "body"), [value]);
  const [colors, setColors] = useState<Record<string, string>>({});

  const allItems = useMemo(
    () => new Set(CLOTHING_GROUPS.flatMap((g) => g.items)),
    [],
  );

  // Clothing entries within the body bracket: any trait whose last word matches a known item.
  const clothingEntries = useMemo(
    () =>
      traits
        .map((t, idx) => ({ t, idx }))
        .filter(({ t }) => {
          const parts = t.trim().split(/\s+/);
          const last = parts[parts.length - 1];
          return allItems.has(last);
        }),
    [traits, allItems],
  );

  const commit = (next: string[]) => {
    onChange(upsertBracket(value ?? "", "body", characterName, next));
  };

  const addItem = (item: string) => {
    const color = colors[item];
    const entry = color ? `${color} ${item}` : item;
    if (traits.includes(entry)) return;
    commit([...traits, entry]);
  };

  const removeAt = (idx: number) => {
    const next = [...traits];
    next.splice(idx, 1);
    commit(next);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border/60 bg-muted/20"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/40 rounded-md cursor-pointer"
        >
          <span className="flex items-center gap-2">
            Klamotten & Anziehsachen
            {clothingEntries.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {clothingEntries.length}
              </Badge>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 px-3 pb-3">
        {clothingEntries.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clothingEntries.map(({ t, idx }) => (
              <Badge key={`${t}-${idx}`} variant="secondary" className="gap-1 pr-1">
                "{t}"
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="rounded-sm hover:bg-background/50 p-0.5"
                  aria-label={`Remove ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {CLOTHING_GROUPS.map((g) => (
            <div key={g.label} className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{g.label}</div>
              <div className="grid gap-1.5">
                {g.items.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <div className="flex-1 text-xs">{item}</div>
                    <Select
                      value={colors[item] ?? ""}
                      onValueChange={(v) =>
                        setColors((p) => ({ ...p, [item]: v }))
                      }
                    >
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue placeholder="Farbe" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLOTHING_COLORS.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addItem(item)}
                      className="h-7 px-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
