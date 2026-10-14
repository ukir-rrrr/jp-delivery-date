import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import iconv from "iconv-lite";
import { parseLocalDate } from "@domain/calendar/local-date";
import { buildLabelFile, type CarrierAdapter } from "@domain/carriers";
import { DEFAULT_SETTINGS_V1, type SettingsV1 } from "@domain/delivery/settings";
import type { NormalizedOrder } from "@domain/order/normalized-order";
import {
  SAGAWA_COLUMNS,
  SAGAWA_TIME_SLOTS,
  sagawaAdapter,
  sagawaColumn,
  sagawaHeader,
  sagawaRow,
} from "@domain/carriers/sagawa";
import {
  YUPACK_COLUMNS,
  YUPACK_TIME_SLOTS,
  yupackColumn,
  yupackHeader,
  yupackRAdapter,
  yupackRow,
} from "@domain/carriers/yupackR";
const SUCCESS = ["standard", "missing-slot", "remote-island", "quoted-item", "buy-now-edited"];

describe("Sagawa e飛伝III columns", () => {
  it("follows the 74-column import layout and the printed required marks", () => {
    expect(SAGAWA_COLUMNS).toHaveLength(74);
    expect(SAGAWA_COLUMNS.map((column) => column.order)).toEqual(SAGAWA_COLUMNS.map((_, index) => index + 1));
    expect(sagawaHeader()).toEqual(SAGAWA_COLUMNS.map((column) => column.label));
    expect(SAGAWA_COLUMNS.filter((column) => column.required).map((column) => column.key)).toEqual([
      "recipientAddress1",
      "recipientName1",
    ]);
    expect(sagawaColumn("recipientAddress1").maxBytes).toBe(32);
    expect(sagawaColumn("recipientAddress1").width).toBe("fullwidth");
    expect(sagawaColumn("senderAddress1").width).toBe("fullwidth");
    expect(sagawaColumn("itemName1").width).toBe("mixed");
    expect(sagawaColumn("recipientPhone").width).toBe("bytes");
    expect(sagawaColumn("recipientPhone").maxBytes).toBe(14);
    expect(sagawaColumn("recipientPostal").maxBytes).toBe(8);
    expect(sagawaColumn("deliveryDate").maxBytes).toBe(8);
    expect(sagawaColumn("timeSlot").maxBytes).toBe(2);
    expect(sagawaColumn("itemName1").maxBytes).toBe(32);
    expect(sagawaAdapter.encoding).toBe("shift_jis");
    expect(sagawaAdapter.encodingVerified).toBe(false);
    expect(SAGAWA_TIME_SLOTS.map((slot) => slot.code)).toEqual(["01", "12", "14", "16", "18", "04", "19"]);
    expect(sagawaAdapter.mapSlot("morning")).toBe("01");
    expect(sagawaAdapter.mapSlot("afternoon_early")).toBe("14");
    expect(sagawaAdapter.mapSlot("afternoon_late")).toBe("16");
    expect(sagawaAdapter.mapSlot("evening")).toBe("18");
    expect(sagawaAdapter.mapSlot("night")).toBe("19");
    expect(sagawaAdapter.mapSlot("unspecified")).toBe("");
    expect(sagawaAdapter.formatDate(parseLocalDate("2026-10-20"))).toBe("20261020");
  });
});

describe("Yu-Print R columns", () => {
  it("uses the official 発送予定 names, 8-byte dates, and ゆうプリR time codes", () => {
    expect(YUPACK_COLUMNS).toHaveLength(20);
    expect(YUPACK_COLUMNS.map((column) => column.order)).toEqual(YUPACK_COLUMNS.map((_, index) => index + 1));
    expect(yupackHeader()).toEqual(YUPACK_COLUMNS.map((column) => column.label));
    expect(YUPACK_COLUMNS.filter((column) => column.required).map((column) => column.key)).toEqual([
      "recipientPostal",
      "recipientAddress1",
      "recipientName1",
      "senderPostal",
      "senderAddress1",
      "senderName1",
    ]);
    expect(yupackColumn("deliveryDate").maxBytes).toBe(8);
    expect(yupackColumn("shipDate").maxBytes).toBe(8);
    expect(yupackColumn("recipientAddress1").maxBytes).toBe(50);
    expect(yupackColumn("recipientPhone").maxBytes).toBe(20);
    expect(yupackColumn("timeSlot").maxBytes).toBe(2);
    expect(yupackRAdapter.encoding).toBe("shift_jis");
    expect(yupackRAdapter.encodingVerified).toBe(false);
    expect(YUPACK_TIME_SLOTS.map((slot) => slot.code)).toEqual(["00", "51", "52", "53", "54", "55", "57", "61", "62", "63"]);
    expect(YUPACK_TIME_SLOTS.map((slot) => slot.code)).not.toContain("56");
    expect(yupackRAdapter.mapSlot("unspecified")).toBe("00");
    expect(yupackRAdapter.mapSlot("morning")).toBe("51");
    expect(yupackRAdapter.mapSlot("afternoon_early")).toBe("53");
    expect(yupackRAdapter.mapSlot("afternoon_late")).toBe("54");
    expect(yupackRAdapter.mapSlot("evening")).toBe("55");
    expect(yupackRAdapter.mapSlot("night")).toBe("57");
    expect(yupackRAdapter.formatDate(parseLocalDate("2026-10-20"))).toBe("20261020");
  });
});

describe.each([
  { name: "sagawa", root: "tests/golden/sagawa", adapter: sagawaAdapter, row: sagawaRow, columns: SAGAWA_COLUMNS },
  { name: "yupackR", root: "tests/golden/yupackR", adapter: yupackRAdapter, row: yupackRow, columns: YUPACK_COLUMNS },
])("$name rows and golden files", ({ root, adapter, row, columns }) => {
  it.each(SUCCESS)("%s matches the Shift_JIS file byte for byte", (caseName) => {
    const { order, settings } = loadCase(root, caseName);
    const file = buildLabelFile(adapter, [order], settings);
    expect(file.ok, JSON.stringify(file.ok ? null : file.error)).toBe(true);
    if (!file.ok) return;
    expect(Buffer.from(file.value)).toEqual(readFileSync(join(root, caseName, "expected.csv")));
    expect(file.value[0]).toBe(0x82);
    expect(file.value[1]).toBe(0xa8);
    const table = decodeCsv(file.value);
    expect(table).toHaveLength(2);
    expect(table[0]).toEqual(columns.map((column) => column.label));
    expect(table[1]).toHaveLength(columns.length);
  });

  it("flags a Buy Now order instead of emitting a blank delivery date", () => {
    const { order, settings } = loadCase(root, "buy-now");
    const view = row(order, settings);
    expect(view.issues.map((issue) => issue.code)).toContain("missing_delivery_date");
    expect(adapter.toRow(order, settings).ok).toBe(false);
    expect(buildLabelFile(adapter, [order], settings).ok).toBe(false);
  });

  it("keeps a gaiji name and does not substitute it", () => {
    const { order, settings } = loadCase(root, "gaiji");
    const view = row(order, settings);
    const name = cell(view.cells, columns, "recipientName1");
    expect(name).toBe("髙橋健");
    expect(name).not.toContain("高橋");
    expect(view.issues.find((issue) => issue.code === "jis_out_of_range")?.suggestion).toBe("高");
    expect(adapter.toRow(order, settings).ok).toBe(false);
  });

  it("flags a long building name without truncating it", () => {
    const { order, settings } = loadCase(root, "long-building");
    const view = row(order, settings);
    const address = cell(view.cells, columns, "recipientAddress1");
    expect(address).toContain(order.address.address2);
    expect([...(order.address.address2)].length).toBe(80);
    expect(view.issues.some((issue) => issue.code === "field_overflow" && issue.field === "recipientAddress1")).toBe(true);
    expect(adapter.toRow(order, settings).ok).toBe(false);
  });

  it("keeps a wave dash and flags an en dash instead of rewriting either", () => {
    const { order, settings } = loadCase(root, "standard");
    const wave = row({ ...order, name: "山～田" }, settings);
    expect(cell(wave.cells, columns, "recipientName1")).toBe("山～田");
    expect(wave.issues.some((issue) => issue.code === "jis_out_of_range")).toBe(false);

    const dashed = row({ ...order, address: { ...order.address, address1: "神宮前1–2–3" } }, settings);
    const address = cell(dashed.cells, columns, "recipientAddress1");
    expect(address).toContain("–");
    expect(address).not.toContain("神宮前1-2-3");
    expect(dashed.issues.some((issue) => issue.code === "jis_out_of_range")).toBe(true);
    expect(adapter.toRow({ ...order, address: { ...order.address, address1: "神宮前1–2–3" } }, settings).ok).toBe(false);
  });
});

describe("carrier golden rows", () => {
  it("locks the Sagawa standard row, including codes that have no cart slot", () => {
    const file = fileOf("tests/golden/sagawa", sagawaAdapter, "standard");
    const row = decodeCsv(file)[1] ?? [];
    expect(at(row, sagawaColumn("customerCode"))).toBe("1001");
    expect(at(row, sagawaColumn("shipDate"))).toBe("20261014");
    expect(at(row, sagawaColumn("deliveryDate"))).toBe("20261020");
    expect(at(row, sagawaColumn("timeSlot"))).toBe("01");
    expect(at(row, sagawaColumn("recipientPhone"))).toBe("090-1111-2222");
    expect(at(row, sagawaColumn("recipientPostal"))).toBe("150-0001");
    expect(
      [at(row, sagawaColumn("recipientAddress1")), at(row, sagawaColumn("recipientAddress2")), at(row, sagawaColumn("recipientAddress3"))].join(""),
    ).toBe("東京都渋谷区神宮前1-2-3サンプルマンション101");
    expect(at(row, sagawaColumn("recipientName1"))).toBe("山田太郎");
    expect(at(row, sagawaColumn("senderName1"))).toBe("山田商店");
    expect(
      [at(row, sagawaColumn("senderAddress1")), at(row, sagawaColumn("senderAddress2"))].join(""),
    ).toBe("東京都千代田区丸の内1-1商店ビル");
    for (const key of ["recipientAddress1", "recipientAddress2", "recipientAddress3", "senderAddress1", "senderAddress2", "recipientName1", "senderName1"]) {
      expect([...at(row, sagawaColumn(key))].length).toBeLessThanOrEqual(16);
    }
    expect(at(row, sagawaColumn("itemName1"))).toBe("ギフト箱");
    expect(at(row, sagawaColumn("pieceCount"))).toBe("1");
    expect(at(row, sagawaColumn("speed"))).toBe("000");
    expect(at(row, sagawaColumn("cool"))).toBe("001");
    expect(at(row, sagawaColumn("freightPayer"))).toBe("1");
    expect(at(row, sagawaColumn("accountCode"))).toBe("");
    expect(at(row, sagawaColumn("officeHold"))).toBe("0");
    expect(at(row, sagawaColumn("src"))).toBe("0");
  });

  it("leaves the Sagawa time slot blank when the merchant did not choose one", () => {
    const row = decodeCsv(fileOf("tests/golden/sagawa", sagawaAdapter, "missing-slot"))[1] ?? [];
    expect(at(row, sagawaColumn("timeSlot"))).toBe("");
    expect(at(row, sagawaColumn("deliveryDate"))).toBe("20261020");
  });

  it("writes the Sagawa night code and a remote-island address", () => {
    const row = decodeCsv(fileOf("tests/golden/sagawa", sagawaAdapter, "remote-island"))[1] ?? [];
    expect(at(row, sagawaColumn("timeSlot"))).toBe("19");
    expect(at(row, sagawaColumn("recipientPostal"))).toBe("900-0015");
    expect(
      [at(row, sagawaColumn("recipientAddress1")), at(row, sagawaColumn("recipientAddress2"))].join(""),
    ).toContain("沖縄県那覇市久茂地1-1");
    expect(at(row, sagawaColumn("recipientName1"))).toBe("海野花");
  });

  it("quotes a Sagawa product name and uses the 14:00–16:00 code", () => {
    const bytes = fileOf("tests/golden/sagawa", sagawaAdapter, "quoted-item");
    const text = iconv.decode(Buffer.from(bytes), "shiftjis");
    expect(text).toContain('"箱,""大"""');
    const row = decodeCsv(bytes)[1] ?? [];
    expect(at(row, sagawaColumn("timeSlot"))).toBe("14");
    expect(at(row, sagawaColumn("itemName1"))).toBe('箱,"大"');
  });

  it("writes an in-memory Sagawa date as 8 digits and the evening code", () => {
    const row = decodeCsv(fileOf("tests/golden/sagawa", sagawaAdapter, "buy-now-edited"))[1] ?? [];
    expect(at(row, sagawaColumn("deliveryDate"))).toBe("20261018");
    expect(at(row, sagawaColumn("timeSlot"))).toBe("18");
    expect(at(row, sagawaColumn("recipientName1"))).toBe("佐藤花");
  });

  it("locks the Yu-Print R standard row", () => {
    const row = decodeCsv(fileOf("tests/golden/yupackR", yupackRAdapter, "standard"))[1] ?? [];
    expect(at(row, yupackColumn("customerCode"))).toBe("1001");
    expect(at(row, yupackColumn("shipDate"))).toBe("20261014");
    expect(at(row, yupackColumn("deliveryDate"))).toBe("20261020");
    expect(at(row, yupackColumn("timeSlot"))).toBe("51");
    expect(at(row, yupackColumn("recipientPostal"))).toBe("150-0001");
    expect(at(row, yupackColumn("recipientAddress1"))).toBe("東京都渋谷区神宮前1-2-3サンプルマンション101");
    expect(at(row, yupackColumn("recipientName1"))).toBe("山田太郎");
    expect(at(row, yupackColumn("senderName1"))).toBe("山田商店");
    expect(at(row, yupackColumn("itemName1"))).toBe("ギフト箱");
  });

  it("writes Yu-Print R 希望しない as 00", () => {
    const row = decodeCsv(fileOf("tests/golden/yupackR", yupackRAdapter, "missing-slot"))[1] ?? [];
    expect(at(row, yupackColumn("timeSlot"))).toBe("00");
  });

  it("writes the Yu-Print R night code for a remote island", () => {
    const row = decodeCsv(fileOf("tests/golden/yupackR", yupackRAdapter, "remote-island"))[1] ?? [];
    expect(at(row, yupackColumn("timeSlot"))).toBe("57");
    expect(at(row, yupackColumn("recipientPostal"))).toBe("900-0015");
    expect(at(row, yupackColumn("recipientAddress1"))).toContain("沖縄県那覇市久茂地1-1");
    expect(at(row, yupackColumn("recipientName1"))).toBe("海野花");
  });

  it("quotes a Yu-Print R product name and uses the 14～16時 code", () => {
    const bytes = fileOf("tests/golden/yupackR", yupackRAdapter, "quoted-item");
    expect(iconv.decode(Buffer.from(bytes), "shiftjis")).toContain('"箱,""大"""');
    const row = decodeCsv(bytes)[1] ?? [];
    expect(at(row, yupackColumn("timeSlot"))).toBe("53");
    expect(at(row, yupackColumn("itemName1"))).toBe('箱,"大"');
  });

  it("writes an in-memory Yu-Print R date as 8 digits and the evening code", () => {
    const row = decodeCsv(fileOf("tests/golden/yupackR", yupackRAdapter, "buy-now-edited"))[1] ?? [];
    expect(at(row, yupackColumn("deliveryDate"))).toBe("20261018");
    expect(at(row, yupackColumn("timeSlot"))).toBe("55");
  });

  it("packs a Sagawa address by 16 characters after half-width conversion", () => {
    const { order, settings } = loadCase("tests/golden/sagawa", "standard");
    const view = sagawaRow(
      {
        ...order,
        address: { ...order.address, province: "埼玉県", city: "さいたま市大宮区", address1: "桜木町1-1", address2: "" },
      },
      settings,
    );
    const lines = ["recipientAddress1", "recipientAddress2", "recipientAddress3"].map((key) => cell(view.cells, SAGAWA_COLUMNS, key));
    expect(lines.join("")).toBe("埼玉県さいたま市大宮区桜木町1-1");
    expect(lines[0]).not.toBe("埼玉県さいたま市大宮区桜木町1-1");
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(16);
    expect(view.issues.some((issue) => issue.code === "field_overflow")).toBe(false);
  });

  it("splits a mixed Sagawa item name and keeps a 32-character half-width name", () => {
    const { order, settings } = loadCase("tests/golden/sagawa", "standard");
    const mixed = sagawaRow({ ...order, lineItems: ["ギフト箱ABC-123456789"] }, settings);
    const item1 = cell(mixed.cells, SAGAWA_COLUMNS, "itemName1");
    const item2 = cell(mixed.cells, SAGAWA_COLUMNS, "itemName2");
    expect(item1).not.toBe("ギフト箱ABC-123456789");
    expect(`${item1}${item2}`).toBe("ギフト箱ABC-123456789");
    expect([...item1].length).toBeLessThanOrEqual(16);
    expect(mixed.issues.some((issue) => issue.code === "field_overflow")).toBe(false);

    const half = "A".repeat(32);
    const ascii = sagawaRow({ ...order, lineItems: [half] }, settings);
    expect(cell(ascii.cells, SAGAWA_COLUMNS, "itemName1")).toBe(half);
    expect(cell(ascii.cells, SAGAWA_COLUMNS, "itemName2")).toBe("");
    expect(ascii.issues.some((issue) => issue.code === "field_overflow")).toBe(false);
  });

  it("rejects a Sagawa phone that exceeds 14 characters and accepts it for Yu-Print R", () => {
    const { order, settings } = loadCase("tests/golden/sagawa", "standard");
    const longPhone = { ...order, phone: "090-1111-222233" };
    expect(longPhone.phone).toHaveLength(15);
    expect(sagawaRow(longPhone, settings).issues.some((issue) => issue.field === "recipientPhone")).toBe(true);
    expect(yupackRow(longPhone, settings).issues.some((issue) => issue.field === "recipientPhone")).toBe(false);
  });
});

function loadCase(root: string, name: string): { order: NormalizedOrder; settings: SettingsV1 } {
  const fixture = JSON.parse(readFileSync(join(root, name, "order.json"), "utf8")) as {
    order: NormalizedOrder;
    sender: SettingsV1["sender"];
  };
  return { order: fixture.order, settings: { ...DEFAULT_SETTINGS_V1, sender: fixture.sender } };
}

function fileOf(root: string, adapter: CarrierAdapter, name: string): Uint8Array {
  const { order, settings } = loadCase(root, name);
  const file = buildLabelFile(adapter, [order], settings);
  if (!file.ok) throw new Error(JSON.stringify(file.error));
  return file.value;
}

function at(row: string[], column: { order: number }): string {
  return row[column.order - 1] ?? "";
}

function cell(cells: readonly string[], columns: readonly { key: string; order: number }[], key: string): string {
  const column = columns.find((item) => item.key === key);
  if (!column) throw new Error(key);
  return cells[column.order - 1] ?? "";
}

function decodeCsv(bytes: Uint8Array): string[][] {
  const text = iconv.decode(Buffer.from(bytes), "shiftjis");
  expect(text.endsWith("\r\n")).toBe(true);
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
