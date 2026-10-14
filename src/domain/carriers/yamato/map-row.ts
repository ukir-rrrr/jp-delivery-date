import { jisCheck } from "../../address/jis-check";
import { SUGGESTED_SUBSTITUTIONS } from "../../address/substitutions";
import { normalizeCsvText, normalizePhone, normalizePostal } from "../../address/normalize";
import { packByBytes } from "../../address/split-address";
import { compareLocalDate, formatSlashDate } from "../../calendar/local-date";
import type { SettingsV1 } from "../../delivery/settings";
import type { Issue } from "../adapter";
import type { NormalizedOrder } from "../../order/normalized-order";
import { YAMATO_COLUMNS, YAMATO_SLOT_CODES, yamatoColumn } from "./columns";

export interface YamatoRowView {
  cells: string[];
  issues: Issue[];
}

const PREVIEW_KEYS = [
  "customerCode",
  "shipDate",
  "deliveryDate",
  "timeSlot",
  "recipientName",
  "recipientPostal",
  "recipientAddress",
  "recipientBuilding",
  "recipientPhone",
  "itemName1",
  "itemName2",
] as const;

/**
 * Map one order onto the 97 B2 columns.
 * Overflowing and non-JIS fields keep their full text in `cells` so the
 * screen can show them. `toRow` still refuses the row, so those cells are
 * never encoded.
 *
 * 送り状種類 is 0 (発払い, p.1). 発行枚数 is 1 (p.2, 通常は「1」).
 * クール区分 is blank (通常, p.1). 伝票番号 is blank on input (p.1).
 * A blank お届け予定日 is legal in the PDF (p.1, 入力なしの場合、印字されません)
 * but this app flags it so a Buy Now order is not exported as "no preference"
 * until the merchant types a date.
 */
export function yamatoRow(order: NormalizedOrder, settings: SettingsV1): YamatoRowView {
  const cells = YAMATO_COLUMNS.map(() => "");
  const issues: Issue[] = [];
  if (order.pcdRedacted) {
    issues.push({
      code: "pcd_redacted",
      message: "氏名・住所・電話が取得できません。保護された顧客データが未承認のときは空の送り状を出しません。",
    });
    return { cells, issues };
  }

  putRaw(cells, "invoiceType", "0");
  putRaw(cells, "labelCount", "1");
  putCustomerCode(cells, issues, order.orderId);
  putSchedule(cells, issues, order);
  putRaw(cells, "timeSlot", YAMATO_SLOT_CODES[order.slot]);
  putParty(cells, issues, "recipient", {
    name: order.name,
    phone: order.phone,
    postalCode: order.address.postalCode,
    province: order.address.province,
    city: order.address.city,
    address1: order.address.address1,
    address2: order.address.address2,
  });
  putParty(cells, issues, "sender", {
    name: settings.sender.name ?? "",
    phone: settings.sender.phone ?? "",
    postalCode: settings.sender.postalCode ?? "",
    province: settings.sender.prefecture ?? "",
    city: "",
    address1: settings.sender.address1 ?? "",
    address2: settings.sender.address2 ?? "",
  });
  putItems(cells, issues, order);
  putAccount(cells, issues, settings);
  return { cells, issues };
}

export function yamatoPreview(cells: readonly string[]): { label: string; value: string }[] {
  return PREVIEW_KEYS.map((key) => {
    const column = yamatoColumn(key);
    return { label: column.label, value: cells[column.order - 1] ?? "" };
  }).filter((line, index) => line.value !== "" || index < 9);
}

function putSchedule(cells: string[], issues: Issue[], order: NormalizedOrder): void {
  if (order.shipDate) {
    putRaw(cells, "shipDate", formatSlashDate(order.shipDate));
  } else {
    issues.push(issue("required", "shipDate", "出荷予定日がありません。"));
  }
  if (!order.deliveryDate) {
    issues.push(issue("missing_delivery_date", "deliveryDate", "配達希望日がありません。行の日付を入れてから書き出してください。"));
    return;
  }
  putRaw(cells, "deliveryDate", formatSlashDate(order.deliveryDate));
  if (order.shipDate && compareLocalDate(order.deliveryDate, order.shipDate) < 0) {
    issues.push(issue("delivery_before_ship", "deliveryDate", "配達希望日が出荷予定日より前です。"));
  }
}

function putCustomerCode(cells: string[], issues: Issue[], orderId: string): void {
  const digits = orderId.replace(/\D/g, "");
  const column = yamatoColumn("customerCode");
  if (digits.length > column.maxBytes) {
    cells[column.order - 1] = digits;
    issues.push(issue("field_overflow", "customerCode", limitMessage(column.label, digits.length, column.maxBytes)));
    return;
  }
  cells[column.order - 1] = digits;
}

function putParty(
  cells: string[],
  issues: Issue[],
  who: "recipient" | "sender",
  party: {
    name: string;
    phone: string;
    postalCode: string;
    province: string;
    city: string;
    address1: string;
    address2: string;
  },
): void {
  const prefix = who === "recipient" ? "お届け先" : "ご依頼主";
  putPhone(cells, issues, `${who}Phone`, party.phone, `${prefix}電話番号`);
  putPostal(cells, issues, `${who}Postal`, party.postalCode, `${prefix}郵便番号`);
  placeText(cells, issues, [`${who}Name`], party.name, true);
  const street = [party.province, party.city, party.address1].map(normalizeCsvText).filter(Boolean).join("");
  placeText(cells, issues, [`${who}Address`], street, true);
  placeText(cells, issues, [`${who}Building`], party.address2, false);
}

function putItems(cells: string[], issues: Issue[], order: NormalizedOrder): void {
  if (order.lineItemsTruncated) {
    issues.push(issue("line_items_truncated", "itemName1", "商品が20件を超えています。品名に入りきらないため書き出せません。"));
  }
  placeText(cells, issues, ["itemName1", "itemName2"], order.lineItems.join("、"), true);
}

function placeText(
  cells: string[],
  issues: Issue[],
  keys: readonly string[],
  raw: string,
  required: boolean,
): void {
  const columns = keys.map((key) => yamatoColumn(key));
  const first = columns[0];
  if (!first) return;
  const value = normalizeCsvText(raw);
  cells[first.order - 1] = value;
  const blocked = reportJis(issues, first.key, first.label, value);
  if (value === "") {
    if (required) issues.push(issue("required", first.key, `「${first.label}」がありません。`));
    return;
  }
  if (blocked) return;
  const packed = packByBytes(value, columns.map((column) => column.maxBytes));
  if (packed.overflow) {
    issues.push(issue("field_overflow", first.key, `「${first.label}」が上限を超えています。切らずに止めています。`));
    return;
  }
  columns.forEach((column, index) => {
    cells[column.order - 1] = packed.parts[index] ?? "";
  });
}

function putAccount(cells: string[], issues: Issue[], settings: SettingsV1): void {
  putDigits(
    cells,
    issues,
    "billingCode",
    settings.sender.yamatoBillingCode ?? "",
    /^\d{1,12}$/,
    "設定のヤマトご請求先顧客コードがありません。半角数字12桁以内です。",
  );
  putDigits(
    cells,
    issues,
    "freightNumber",
    settings.sender.yamatoFreightNumber ?? "",
    /^\d{1,2}$/,
    "設定のヤマト運賃管理番号がありません。半角数字2桁以内です。",
  );
}

function putPhone(cells: string[], issues: Issue[], key: string, raw: string, label: string): void {
  const phone = normalizePhone(raw);
  const column = yamatoColumn(key);
  cells[column.order - 1] = phone.value;
  if (!phone.ok) {
    issues.push(issue(phone.value === "" ? "required" : "invalid_field", key, `「${label}」はハイフンを含む半角15文字以内です。`));
  }
}

function putPostal(cells: string[], issues: Issue[], key: string, raw: string, label: string): void {
  const postal = normalizePostal(raw);
  const column = yamatoColumn(key);
  cells[column.order - 1] = postal.value;
  if (!postal.ok) {
    issues.push(issue(postal.value === "" ? "required" : "invalid_field", key, `「${label}」は半角7桁です。`));
  }
}

function putDigits(
  cells: string[],
  issues: Issue[],
  key: string,
  raw: string,
  pattern: RegExp,
  message: string,
): void {
  const column = yamatoColumn(key);
  const value = normalizeCsvText(raw).replaceAll(" ", "");
  cells[column.order - 1] = value;
  if (!pattern.test(value)) issues.push(issue(value === "" ? "required" : "invalid_field", key, message));
}

function putRaw(cells: string[], key: string, value: string): void {
  const column = yamatoColumn(key);
  cells[column.order - 1] = value;
}

function reportJis(issues: Issue[], field: string, label: string, value: string): boolean {
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

function issue(code: string, field: string, message: string): Issue {
  return { code, field, message };
}

function limitMessage(label: string, actual: number, max: number): string {
  return `「${label}」が${actual}バイトで、上限${max}バイトを超えています。切らずに止めています。`;
}
