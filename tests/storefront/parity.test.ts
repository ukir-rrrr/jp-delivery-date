import { gzipSync } from "node:zlib";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { build } from "vite";
import { earliestDate, type EarliestDateInput } from "@domain/delivery/earliest-date";
import { validateSelection } from "@domain/delivery/selection";
import { DEFAULT_SETTINGS_V1 } from "@domain/delivery/settings";

const fixtures: EarliestDateInput[] = [
  {
    now: { epochMs: Date.parse("2026-10-14T14:59:00+09:00"), timeZone: "Asia/Tokyo" },
    settings: DEFAULT_SETTINGS_V1,
    items: [],
  },
  {
    now: { epochMs: Date.parse("2026-10-14T15:00:00+09:00"), timeZone: "Asia/Tokyo" },
    settings: DEFAULT_SETTINGS_V1,
    items: [{ productId: "1", leadTimeDays: 2 }],
    prefecture: "47",
  },
  {
    now: { epochMs: Date.parse("2026-12-28T10:00:00+09:00"), timeZone: "Asia/Tokyo" },
    settings: {
      ...DEFAULT_SETTINGS_V1,
      holidays: [],
      prefectureLeadDays: { "13": 1, "47": 5 },
    },
    items: [
      { productId: "a", leadTimeDays: 0 },
      { productId: "b", leadTimeDays: 3 },
    ],
  },
  {
    now: { epochMs: Date.parse("2024-02-28T09:00:00+09:00"), timeZone: "Asia/Tokyo" },
    settings: { ...DEFAULT_SETTINGS_V1, newYearPreset: false, closedWeekdays: [0, 6] },
    items: [{ productId: "1", leadTimeDays: 1 }],
    prefecture: "13",
  },
];

async function loadBundle(path: string) {
  const code = await readFile(path, "utf8");
  const sandbox: { JpDeliveryDate?: Record<string, unknown>; console: Console } = {
    console,
  };
  runInContext(code, createContext(sandbox), { filename: path });
  const api = sandbox.JpDeliveryDate;
  if (!api || typeof api.earliestDate !== "function") {
    throw new Error(`bundle ${path} did not export earliestDate`);
  }
  return api as {
    earliestDate: typeof earliestDate;
    validateSelection: typeof validateSelection;
  };
}

async function freshBundlePath(): Promise<{ path: string; gzipBytes: number }> {
  const outDir = await mkdtemp(join(tmpdir(), "jp-delivery-"));
  await build({
    configFile: fileURLToPath(new URL("../../vite.extension.config.ts", import.meta.url)),
    build: { outDir, emptyOutDir: true },
    logLevel: "error",
  });
  const path = join(outDir, "delivery-engine.js");
  const code = await readFile(path);
  return { path, gzipBytes: gzipSync(code).length };
}

describe("storefront bundle parity", () => {
  it(
    "matches the server engine and stays under 15 KB gzipped",
    async () => {
      const fresh = await freshBundlePath();
      expect(fresh.gzipBytes).toBeLessThan(15 * 1024);
      const bundled = await loadBundle(fresh.path);
      const committed = await loadBundle(
        fileURLToPath(
          new URL(
            "../../extensions/delivery-cart-block/assets/delivery-engine.js",
            import.meta.url,
          ),
        ),
      );

      for (const fixture of fixtures) {
        expect(bundled.earliestDate(fixture)).toEqual(earliestDate(fixture));
        expect(committed.earliestDate(fixture)).toEqual(earliestDate(fixture));
      }

      const selection = {
        required: true,
        date: "2026-10-20",
        slot: "morning",
        selectable: ["2026-10-20"],
        offeredSlots: ["morning"],
      };
      expect(bundled.validateSelection(selection)).toEqual(validateSelection(selection));
      expect(committed.validateSelection(selection)).toEqual(validateSelection(selection));
    },
    60_000,
  );
});
