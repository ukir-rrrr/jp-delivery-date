import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORBIDDEN =
  /from\s+['"](@shopify\/|@prisma\/|prisma['"]|@infra\/|react-router|react['"]|react-dom|node:|fs['"]|path['"])/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("src/domain purity", () => {
  it("does not import Shopify, Prisma, React, infra, or Node I/O", () => {
    const files = walk("src/domain");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(FORBIDDEN);
      expect(src, file).not.toMatch(/Date\.now\(/);
      expect(src, file).not.toMatch(/new Date\(\)/);
    }
  });
});
