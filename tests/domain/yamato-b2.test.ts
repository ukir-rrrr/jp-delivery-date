import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import iconv from "iconv-lite";
import { DEFAULT_SETTINGS_V1, type SettingsV1 } from "@domain/delivery/settings";
import type { NormalizedOrder } from "@domain/order/normalized-order";
import {
  YAMATO_COLUMNS,
  buildYamatoFile,
  yamatoAdapter,
  yamatoColumn,
  yamatoRow,
} from "@domain/carriers/yamato";

const ROOT = "tests/golden/yamato";
const SUCCESS = ["standard", "missing-slot", "remote-island", "quoted-item", "buy-now-edited"];

describe("Yamato B2 columns", () => {
  it("follows the 97-column layout and the 宅急便 required set", () => {
    expect(YAMATO_COLUMNS).toHaveLength(97);
    expect(YAMATO_COLUMNS.map((column) => column.order)).toEqual(YAMATO_COLUMNS.map((_, index) => index + 1));
    expect(new Set(YAMATO_COLUMNS.map((column) => column.key)).size).toBe(97);
    expect(YAMATO_COLUMNS.filter((column) => column.required).map((column) => column.key)).toEqual([
      "invoiceType",
      "shipDate",
      "recipientPhone",
      "recipientPostal",
      "recipientAddress",
      "recipientName",
      "senderPhone",
      "senderPostal",
      "senderAddress",
      "senderName",
      "itemName1",
      "billingCode",
      "freightNumber",
    ]);
    expect(yamatoColumn("deliveryDate").label).toBe("お届け予定（指定）日");
    expect(yamatoColumn("deliveryMailAddress").label).toBe("お届け予定ｅメールe-mailアドレス");
    expect(yamatoColumn("storageAmount").label).toBe("収納代行請求金額(税込)");
    expect(yamatoColumn("recipientAddress").maxBytes).toBe(64);
    expect(yamatoColumn("recipientBuilding").maxBytes).toBe(32);
    expect(yamatoAdapter.encoding).toBe("shift_jis");
    expect(yamatoAdapter.encodingVerified).toBe(false);
    expect(yamatoAdapter.mapSlot("morning")).toBe("0812");
    expect(yamatoAdapter.mapSlot("afternoon_early")).toBe("1416");
    expect(yamatoAdapter.mapSlot("afternoon_late")).toBe("1618");
    expect(yamatoAdapter.mapSlot("evening")).toBe("1820");
    expect(yamatoAdapter.mapSlot("night")).toBe("1921");
    expect(yamatoAdapter.mapSlot("unspecified")).toBe("");
  });
});

describe("Yamato B2 rows", () => {
  it("flags a Buy Now order instead of emitting a blank delivery date", () => {
    const { order, settings } = loadCase("buy-now");
    const view = yamatoRow(order, settings);
    expect(view.issues.map((issue) => issue.code)).toContain("missing_delivery_date");
    expect(yamatoAdapter.toRow(order, settings).ok).toBe(false);
    expect(view.cells[yamatoColumn("deliveryDate").order - 1]).toBe("");
  });

  it("keeps a gaiji name and does not substitute it", () => {
    const { order, settings } = loadCase("gaiji");
    const view = yamatoRow(order, settings);
    const name = view.cells[yamatoColumn("recipientName").order - 1];
    expect(name).toBe("髙橋健");
    expect(name).not.toContain("高橋");
    const found = view.issues.find((issue) => issue.code === "jis_out_of_range");
    expect(found?.suggestion).toBe("高");
    expect(yamatoAdapter.toRow(order, settings).ok).toBe(false);
  });

  it("flags a long building name without truncating it", () => {
    const { order, settings } = loadCase("long-building");
    const view = yamatoRow(order, settings);
    const building = view.cells[yamatoColumn("recipientBuilding").order - 1];
    expect(building).toBe(order.address.address2);
    expect([...(building ?? "")].length).toBe(20);
    expect(view.issues.some((issue) => issue.code === "field_overflow" && issue.field === "recipientBuilding")).toBe(true);
    expect(yamatoAdapter.toRow(order, settings).ok).toBe(false);
  });

  it("keeps a wave dash and flags an en dash instead of rewriting either", () => {
    const { order, settings } = loadCase("standard");
    const wave = { ...order, name: "山～田" };
    const waveView = yamatoRow(wave, settings);
    expect(waveView.cells[yamatoColumn("recipientName").order - 1]).toBe("山～田");
    expect(waveView.issues.some((issue) => issue.code === "jis_out_of_range")).toBe(false);

    const dashed = { ...order, address: { ...order.address, address1: "神宮前1–2–3" } };
    const view = yamatoRow(dashed, settings);
    const address = view.cells[yamatoColumn("recipientAddress").order - 1] ?? "";
    expect(address).toContain("–");
    expect(address).not.toContain("神宮前1-2-3");
    expect(view.issues.some((issue) => issue.code === "jis_out_of_range")).toBe(true);
    expect(yamatoAdapter.toRow(dashed, settings).ok).toBe(false);
  });
});

describe("Yamato B2 golden files", () => {
  it.each(SUCCESS)("%s matches the Shift_JIS file byte for byte", (name) => {
    const { order, settings } = loadCase(name);
    const file = buildYamatoFile([order], settings);
    expect(file.ok, JSON.stringify(file.ok ? null : file.error)).toBe(true);
    if (!file.ok) return;
    const expected = readFileSync(join(ROOT, name, "expected.csv"));
    expect(Buffer.from(file.value)).toEqual(expected);

    const table = decodeCsv(file.value);
    expect(table).toHaveLength(2);
    expect(table[0]).toEqual(YAMATO_COLUMNS.map((column) => column.label));
    expect(table[1]).toHaveLength(97);
    expect(table[1]?.[1]).toBe("0");
    expect(table[1]?.[4]).toBe("2026/10/14");
    expect(table[1]?.[37]).toBe("1");
    expect(table[1]?.[39]).toBe("123456789012");
    expect(table[1]?.[41]).toBe("01");
  });

  it("locks the mapped columns of the standard row", () => {
    const { order, settings } = loadCase("standard");
    const file = buildYamatoFile([order], settings);
    if (!file.ok) throw new Error("expected a file");
    const row = decodeCsv(file.value)[1] ?? [];
    expect(row[0]).toBe("1001");
    expect(row[5]).toBe("2026/10/20");
    expect(row[6]).toBe("0812");
    expect(row[8]).toBe("090-1111-2222");
    expect(row[10]).toBe("150-0001");
    expect(row[11]).toBe("東京都渋谷区神宮前1-2-3");
    expect(row[12]).toBe("サンプルマンション101");
    expect(row[15]).toBe("山田太郎");
    expect(row[19]).toBe("03-1234-5678");
    expect(row[21]).toBe("100-0001");
    expect(row[22]).toBe("東京都千代田区丸の内1-1");
    expect(row[23]).toBe("商店ビル");
    expect(row[24]).toBe("山田商店");
    expect(row[27]).toBe("ギフト箱");
    expect(row[3]).toBe("");
  });

  it("leaves the time slot blank when the merchant did not choose one", () => {
    const { order, settings } = loadCase("missing-slot");
    const file = buildYamatoFile([order], settings);
    if (!file.ok) throw new Error("expected a file");
    expect(decodeCsv(file.value)[1]?.[6]).toBe("");
  });

  it("quotes a product name that contains a comma and a quote", () => {
    const { order, settings } = loadCase("quoted-item");
    const file = buildYamatoFile([order], settings);
    if (!file.ok) throw new Error("expected a file");
    const text = iconv.decode(Buffer.from(file.value), "shiftjis");
    expect(text).toContain('"箱,""大"""');
    expect(decodeCsv(file.value)[1]?.[6]).toBe("1416");
    expect(decodeCsv(file.value)[1]?.[27]).toBe('箱,"大"');
  });

  it("writes a remote-island address in Shift_JIS without dropping characters", () => {
    const { order, settings } = loadCase("remote-island");
    const file = buildYamatoFile([order], settings);
    if (!file.ok) throw new Error("expected a file");
    const row = decodeCsv(file.value)[1] ?? [];
    expect(row[6]).toBe("1921");
    expect(row[10]).toBe("900-0015");
    expect(row[11]).toBe("沖縄県那覇市久茂地1-1");
    expect(row[15]).toBe("海野花");
  });
});

function loadCase(name: string): { order: NormalizedOrder; settings: SettingsV1 } {
  const fixture = JSON.parse(readFileSync(join(ROOT, name, "order.json"), "utf8")) as {
    order: NormalizedOrder;
    sender: SettingsV1["sender"];
  };
  return {
    order: fixture.order,
    settings: { ...DEFAULT_SETTINGS_V1, sender: fixture.sender },
  };
}

function decodeCsv(bytes: Uint8Array): string[][] {
  const text = iconv.decode(Buffer.from(bytes), "shiftjis");
  expect(text.endsWith("\r\n")).toBe(true);
  expect(text.includes("\n") && text.split("\n").every((line, index, all) => index === all.length - 1 || line.endsWith("\r"))).toBe(true);
  return text.slice(0, -2).split("\r\n").map(parseCsvLine);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char ?? "";
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char ?? "";
    }
  }
  fields.push(current);
  return fields;
}
