// PNG tEXt chunk reader/writer for SillyTavern character cards.
// Reads/writes the "chara" (v2) and "ccv3" (v3) keywords, base64-encoded JSON.

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function b64encode(str: string): string {
  // utf-8 safe base64
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64decode(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
}

export function parsePngChunks(buf: Uint8Array): PngChunk[] {
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) throw new Error("Not a PNG file");
  const chunks: PngChunk[] = [];
  let p = 8;
  while (p < buf.length) {
    const len = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    const data = buf.slice(p + 8, p + 8 + len);
    chunks.push({ type, data });
    p += 8 + len + 4; // skip crc
    if (type === "IEND") break;
  }
  return chunks;
}

export function buildPng(chunks: PngChunk[]): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array(PNG_SIG)];
  for (const c of chunks) {
    const typeBytes = new TextEncoder().encode(c.type);
    const crc = crc32(concat(typeBytes, c.data));
    parts.push(u32(c.data.length), typeBytes, c.data, u32(crc));
  }
  return concat(...parts);
}

export function readTextChunk(chunks: PngChunk[], keyword: string): string | null {
  for (const c of chunks) {
    if (c.type !== "tEXt") continue;
    const nul = c.data.indexOf(0);
    if (nul < 0) continue;
    const k = new TextDecoder().decode(c.data.slice(0, nul));
    if (k === keyword) return new TextDecoder().decode(c.data.slice(nul + 1));
  }
  return null;
}

export function makeTextChunk(keyword: string, text: string): PngChunk {
  const data = concat(new TextEncoder().encode(keyword), new Uint8Array([0]), new TextEncoder().encode(text));
  return { type: "tEXt", data };
}

export function extractCharaJson(pngBytes: Uint8Array): unknown | null {
  const chunks = parsePngChunks(pngBytes);
  const v3 = readTextChunk(chunks, "ccv3");
  const v2 = readTextChunk(chunks, "chara");
  const raw = v3 ?? v2;
  if (!raw) return null;
  try {
    return JSON.parse(b64decode(raw));
  } catch {
    return null;
  }
}

export function embedCharaJson(pngBytes: Uint8Array, data: unknown): Uint8Array {
  const chunks = parsePngChunks(pngBytes).filter(
    (c) => !(c.type === "tEXt" && (() => {
      const nul = c.data.indexOf(0);
      if (nul < 0) return false;
      const k = new TextDecoder().decode(c.data.slice(0, nul));
      return k === "chara" || k === "ccv3";
    })()),
  );
  const json = JSON.stringify(data);
  const b64 = b64encode(json);
  const chara = makeTextChunk("chara", b64);
  const ccv3 = makeTextChunk("ccv3", b64);
  // Insert before IEND
  const iendIdx = chunks.findIndex((c) => c.type === "IEND");
  const insertAt = iendIdx >= 0 ? iendIdx : chunks.length;
  chunks.splice(insertAt, 0, chara, ccv3);
  return buildPng(chunks);
}
