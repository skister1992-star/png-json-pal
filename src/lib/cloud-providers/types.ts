// Adapter interface and shared types for cloud storage providers.

export type TableName = "lorebooks" | "user_cards";

export type DocRow = {
  id: string;
  name: string;
  data: unknown;
  updated_at: string;
};

export interface CloudAdapter {
  /** Provider id, mostly for logs/UI. */
  readonly id: string;
  /** Verify token / config and throw a useful error if not usable. */
  ensureReady(): Promise<void>;
  list(table: TableName): Promise<DocRow[]>;
  save(
    table: TableName,
    id: string | null,
    name: string,
    data: unknown,
  ): Promise<DocRow>;
  remove(table: TableName, id: string): Promise<void>;
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "loc_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function docFilename(table: TableName, id: string): string {
  return `${table}__${id}.json`;
}

export function parseDocFilename(name: string): { table: TableName; id: string } | null {
  const m = name.match(/^(lorebooks|user_cards)__(.+)\.json$/);
  if (!m) return null;
  return { table: m[1] as TableName, id: m[2] };
}
