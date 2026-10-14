import { jisCheck } from "../address/jis-check";
import { normalizeCsvText, normalizePhone, normalizePostal } from "../address/normalize";
import { SUGGESTED_SUBSTITUTIONS } from "../address/substitutions";
import { fullWidthSlots, mixedWidthSlots, packByBytes, type TextWidth } from "../address/split-address";
import { compareLocalDate, type LocalDate } from "../calendar/local-date";
import { shiftJisByteLength } from "../encoding/jis";
import type { SettingsV1 } from "../delivery/settings";
import type { NormalizedOrder } from "../order/normalized-order";
import type { ColumnSpec, ColumnWidth, Issue } from "./adapter";

export interface KeyedColumn extends ColumnSpec {
  key: string;
}

export function blankCells(count: number): string[] {
  return Array.from({ length: count }, () => "");
}

export function putCell(cells: string[], column: ColumnSpec, value: string): void {
  cells[column.order - 1] = value;
}

export function issue(code: string, field: string, message: string): Issue {
  return { code, field, message };
}

export function pcdRedactedIssue(): Issue {
  return {
    code: "pcd_redacted",
    message: "氏名・住所・電話が取得できません。保護された顧客データが未承認のときは空の送り状を出しません。",
  };
}

/**
 * Keep the full text in the first column. A non-JIS character or a string
 * past the byte budget becomes an issue. Nothing is substituted or cut.
 */
export function writePacked(
  cells: string[],
  issues: Issue[],
  columns: readonly KeyedColumn[],
  raw: string,
  required: boolean,
): void {
  const first = columns[0];
  if (!first) return;
  const value = normalizeCsvText(raw);
  cells[first.order - 1] = value;
  const blocked = flagJis(issues, first.key, first.label, value);
  if (value === "") {
    if (required) issues.push(issue("required", first.key, `「${first.label}」がありません。`));
    return;
  }
  if (blocked) return;
  const packed = packByBytes(
    value,
    columns.map((column) => column.maxBytes),
    widthOf(first),
  );
  if (packed.overflow) {
    issues.push(issue("field_overflow", first.key, `「${first.label}」が上限を超えています。切らずに止めています。`));
    return;
  }
  columns.forEach((column, index) => {
    cells[column.order - 1] = packed.parts[index] ?? "";
  });
}

export function writePhone(cells: string[], issues: Issue[], column: KeyedColumn, raw: string): void {
  const phone = normalizePhone(raw, column.maxBytes);
  cells[column.order - 1] = phone.value;
  if (!phone.ok) {
    issues.push(
      issue(
        phone.value === "" ? "required" : "invalid_field",
        column.key,
        `「${column.label}」はハイフンを含む半角${column.maxBytes}文字以内です。`,
      ),
    );
  }
}

export interface ContactInput {
  name: string;
  phone: string;
  postalCode: string;
  province: string;
  city: string;
  address1: string;
  address2: string;
}

export function recipientContact(order: NormalizedOrder): ContactInput {
  return {
    name: order.name,
    phone: order.phone,
    postalCode: order.address.postalCode,
    province: order.address.province,
    city: order.address.city,
    address1: order.address.address1,
    address2: order.address.address2,
  };
}

/** Sender city is already inside address1. Prefecture is the only province field. */
export function senderContact(settings: SettingsV1): ContactInput {
  return {
    name: settings.sender.name ?? "",
    phone: settings.sender.phone ?? "",
    postalCode: settings.sender.postalCode ?? "",
    province: settings.sender.prefecture ?? "",
    city: "",
    address1: settings.sender.address1 ?? "",
    address2: settings.sender.address2 ?? "",
  };
}

export function flagTruncatedItems(issues: Issue[], order: NormalizedOrder, field: string): void {
  if (!order.lineItemsTruncated) return;
  issues.push({
    code: "line_items_truncated",
    field,
    message: "商品が20件を超えています。品名に入りきらないため書き出せません。",
  });
}

/** Phone, postal code, name, and the joined address. Overflow and non-JIS text stay intact. */
export function writeContact(
  cells: string[],
  issues: Issue[],
  phone: KeyedColumn,
  postal: KeyedColumn,
  names: readonly KeyedColumn[],
  addresses: readonly KeyedColumn[],
  party: ContactInput,
): void {
  writePhone(cells, issues, phone, party.phone);
  writePostal(cells, issues, postal, party.postalCode);
  writePacked(cells, issues, names, party.name, true);
  const address = [party.province, party.city, party.address1, party.address2]
    .map(normalizeCsvText)
    .filter(Boolean)
    .join("");
  writePacked(cells, issues, addresses, address, true);
}

export function writePostal(cells: string[], issues: Issue[], column: KeyedColumn, raw: string): void {
  const postal = normalizePostal(raw);
  cells[column.order - 1] = postal.value;
  if (!postal.ok) {
    issues.push(issue(postal.value === "" ? "required" : "invalid_field", column.key, `「${column.label}」は半角7桁です。`));
  }
}

export function writePattern(
  cells: string[],
  issues: Issue[],
  column: KeyedColumn,
  raw: string,
  pattern: RegExp,
  message: string,
): void {
  const value = normalizeCsvText(raw).replaceAll(" ", "");
  cells[column.order - 1] = value;
  if (!pattern.test(value)) issues.push(issue(value === "" ? "required" : "invalid_field", column.key, message));
}

/** ASCII management numbers. The full value stays in the cell when it is too long. */
export function writeCapped(cells: string[], issues: Issue[], column: KeyedColumn, value: string): void {
  cells[column.order - 1] = value;
  const bytes = shiftJisByteLength(value);
  if (bytes != null && bytes <= column.maxBytes) return;
  const actual = bytes ?? value.length;
  issues.push(
    issue(
      "field_overflow",
      column.key,
      `「${column.label}」が${actual}バイトで、上限${column.maxBytes}バイトを超えています。切らずに止めています。`,
    ),
  );
}

export function writeSchedule(
  cells: string[],
  issues: Issue[],
  order: NormalizedOrder,
  ship: KeyedColumn,
  delivery: KeyedColumn,
  format: (date: LocalDate) => string,
): void {
  if (order.shipDate) putCell(cells, ship, format(order.shipDate));
  else issues.push(issue("required", ship.key, "出荷予定日がありません。"));
  if (!order.deliveryDate) {
    issues.push(issue("missing_delivery_date", delivery.key, "配達希望日がありません。行の日付を入れてから書き出してください。"));
    return;
  }
  putCell(cells, delivery, format(order.deliveryDate));
  if (order.shipDate && compareLocalDate(order.deliveryDate, order.shipDate) < 0) {
    issues.push(issue("delivery_before_ship", delivery.key, "配達希望日が出荷予定日より前です。"));
  }
}

export function orderDigits(orderId: string): string {
  return orderId.replace(/\D/g, "");
}

export function flagJis(issues: Issue[], field: string, label: string, value: string): boolean {
  const found = jisCheck(value, SUGGESTED_SUBSTITUTIONS);
  for (const item of found) {
    const suggestion = item.suggestion ? `候補は「${item.suggestion}」です。自動では置換しません。` : "自動では置換しません。";
    issues.push({
      code: "jis_out_of_range",
      field,
      message: `「${label}」にJIS第1・第2水準以外の文字「${item.char}」があります。${suggestion}`,
      suggestion: item.suggestion,
    });
  }
  return found.length > 0;
}

function widthOf(column: KeyedColumn): TextWidth {
  return WIDTHS[column.width ?? "bytes"];
}

const WIDTHS: Record<ColumnWidth, TextWidth> = {
  bytes: shiftJisByteLength,
  fullwidth: fullWidthSlots,
  mixed: mixedWidthSlots,
};

export function previewLines(
  cells: readonly string[],
  lookup: (key: string) => KeyedColumn,
  keys: readonly string[],
): { label: string; value: string }[] {
  return keys.map((key) => {
    const column = lookup(key);
    return { label: column.label, value: cells[column.order - 1] ?? "" };
  });
}
