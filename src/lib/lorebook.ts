export type LorebookEntry = {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number;
  order: number;
  position: number;
  disable: boolean;
  addMemo: boolean;
  excludeRecursion: boolean;
  probability: number;
  displayIndex: number;
  useProbability: boolean;
  depth: number;
  name?: string;
  // passthrough for unknown fields
  [k: string]: unknown;
};

export type Lorebook = {
  name: string;
  description: string;
  is_creation: boolean;
  scan_depth: number;
  token_budget: number;
  recursive_scanning: boolean;
  extensions: Record<string, unknown>;
  entries: Record<string, LorebookEntry>;
};

export function emptyLorebook(): Lorebook {
  return {
    name: "Neues Lorebook",
    description: "",
    is_creation: false,
    scan_depth: 2,
    token_budget: 512,
    recursive_scanning: false,
    extensions: {},
    entries: {},
  };
}

export function newEntry(uid: number): LorebookEntry {
  return {
    uid,
    key: [],
    keysecondary: [],
    comment: "",
    content: "",
    constant: false,
    selective: false,
    selectiveLogic: 0,
    order: 100,
    position: 0,
    disable: false,
    addMemo: true,
    excludeRecursion: false,
    probability: 100,
    displayIndex: uid,
    useProbability: true,
    depth: 4,
    name: "",
  };
}

export function nextUid(book: Lorebook): number {
  const ids = Object.values(book.entries).map((e) => e.uid ?? 0);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}
