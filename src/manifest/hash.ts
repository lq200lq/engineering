import { createHash } from "node:crypto";

export function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface TreeEntry {
  path: string;
  content: string;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function hashTree(entries: TreeEntry[]): string {
  const normalized = [...entries].sort((a, b) => compareText(a.path, b.path));
  const hash = createHash("sha256");
  for (const entry of normalized) {
    hash.update(entry.path.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(sha256(entry.content));
    hash.update("\n");
  }
  return hash.digest("hex");
}
