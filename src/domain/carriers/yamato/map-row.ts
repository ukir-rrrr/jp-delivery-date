import { normalizeCsvText } from "../../address/normalize";
import { formatSlashDate } from "../../calendar/local-date";
import type { SettingsV1 } from "../../delivery/settings";
import type { NormalizedOrder } from "../../order/normalized-order";
import {
  blankCells,
  flagTruncatedItems,
  orderDigits,
  previewLines,
  putCell,
  recipientContact,
  senderContact,
  writeCapped,
  writePacked,
  writePattern,
  writePhone,
  writePostal,
  writeSchedule,
  pcdRedactedIssue,
  type ContactInput,
} from "../cells";
import type { Issue, RowView } from "../adapter";
import { YAMATO_COLUMNS, YAMATO_SLOT_CODES, yamatoColumn } from "./columns";

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
export function yamatoRow(order: NormalizedOrder, settings: SettingsV1): RowView {
  const cells = blankCells(YAMATO_COLUMNS.length);
  const issues: Issue[] = [];
  if (order.pcdRedacted) {
    issues.push(pcdRedactedIssue());
    return { cells, issues };
  }

  putCell(cells, yamatoColumn("invoiceType"), "0");
  putCell(cells, yamatoColumn("labelCount"), "1");
  writeCapped(cells, issues, yamatoColumn("customerCode"), orderDigits(order.orderId));
  writeSchedule(cells, issues, order, yamatoColumn("shipDate"), yamatoColumn("deliveryDate"), formatSlashDate);
  putCell(cells, yamatoColumn("timeSlot"), YAMATO_SLOT_CODES[order.slot]);
  putParty(cells, issues, "recipient", recipientContact(order));
  putParty(cells, issues, "sender", senderContact(settings));
  putItems(cells, issues, order);
  putAccount(cells, issues, settings);
  return { cells, issues };
}

export function yamatoPreview(cells: readonly string[]): { label: string; value: string }[] {
  return previewLines(cells, yamatoColumn, PREVIEW_KEYS).filter((line, index) => line.value !== "" || index < 9);
}

function putParty(
  cells: string[],
  issues: Issue[],
  who: "recipient" | "sender",
  party: ContactInput,
): void {
  writePhone(cells, issues, yamatoColumn(`${who}Phone`), party.phone);
  writePostal(cells, issues, yamatoColumn(`${who}Postal`), party.postalCode);
  writePacked(cells, issues, [yamatoColumn(`${who}Name`)], party.name, true);
  const street = [party.province, party.city, party.address1].map(normalizeCsvText).filter(Boolean).join("");
  writePacked(cells, issues, [yamatoColumn(`${who}Address`)], street, true);
  writePacked(cells, issues, [yamatoColumn(`${who}Building`)], party.address2, false);
}

function putItems(cells: string[], issues: Issue[], order: NormalizedOrder): void {
  flagTruncatedItems(issues, order, "itemName1");
  writePacked(cells, issues, [yamatoColumn("itemName1"), yamatoColumn("itemName2")], order.lineItems.join("、"), true);
}

function putAccount(cells: string[], issues: Issue[], settings: SettingsV1): void {
  writePattern(
    cells,
    issues,
    yamatoColumn("billingCode"),
    settings.sender.yamatoBillingCode ?? "",
    /^\d{1,12}$/,
    "設定のヤマトご請求先顧客コードがありません。半角数字12桁以内です。",
  );
  writePattern(
    cells,
    issues,
    yamatoColumn("freightNumber"),
    settings.sender.yamatoFreightNumber ?? "",
    /^\d{1,2}$/,
    "設定のヤマト運賃管理番号がありません。半角数字2桁以内です。",
  );
}
