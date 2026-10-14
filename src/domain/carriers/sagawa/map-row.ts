import { formatCompactDate } from "../../calendar/local-date";
import type { SettingsV1 } from "../../delivery/settings";
import type { NormalizedOrder } from "../../order/normalized-order";
import type { Issue, RowView } from "../adapter";
import {
  blankCells,
  flagTruncatedItems,
  orderDigits,
  pcdRedactedIssue,
  previewLines,
  putCell,
  recipientContact,
  senderContact,
  writeCapped,
  writeContact,
  writePacked,
  writeSchedule,
} from "../cells";
import { SAGAWA_COLUMNS, SAGAWA_SLOT_CODES, sagawaColumn } from "./columns";

const PREVIEW_KEYS = [
  "customerCode",
  "shipDate",
  "deliveryDate",
  "timeSlot",
  "recipientName1",
  "recipientPostal",
  "recipientAddress1",
  "recipientPhone",
  "itemName1",
] as const;

const ITEM_KEYS = ["itemName1", "itemName2", "itemName3", "itemName4", "itemName5"] as const;

/**
 * One order on the 74-column e飛伝III import layout (printed pp.417–420).
 *
 * App defaults, each a code the layout defines, for one prepaid 飛脚宅配便 parcel:
 * 出荷個数 1 (p.418, 半角数字), スピード指定 000 飛脚宅配便 (p.418),
 * クール便指定 001 指定なし (p.418), 営業所受取 0 通常出荷 (p.419),
 * SRC区分 0 指定なし (p.419), 元着区分 1 元払 (p.419).
 * お客様コード is left blank. The layout does not mark it required (p.417).
 * 配達日 is 8 digits (p.418). A blank date is not written: the row is flagged.
 */
export function sagawaRow(order: NormalizedOrder, settings: SettingsV1): RowView {
  const cells = blankCells(SAGAWA_COLUMNS.length);
  const issues: Issue[] = [];
  if (order.pcdRedacted) {
    issues.push(pcdRedactedIssue());
    return { cells, issues };
  }

  putCell(cells, sagawaColumn("pieceCount"), "1");
  putCell(cells, sagawaColumn("speed"), "000");
  putCell(cells, sagawaColumn("cool"), "001");
  putCell(cells, sagawaColumn("officeHold"), "0");
  putCell(cells, sagawaColumn("src"), "0");
  putCell(cells, sagawaColumn("freightPayer"), "1");
  writeCapped(cells, issues, sagawaColumn("customerCode"), orderDigits(order.orderId));
  writeSchedule(cells, issues, order, sagawaColumn("shipDate"), sagawaColumn("deliveryDate"), formatCompactDate);
  putCell(cells, sagawaColumn("timeSlot"), SAGAWA_SLOT_CODES[order.slot]);
  writeContact(
    cells,
    issues,
    sagawaColumn("recipientPhone"),
    sagawaColumn("recipientPostal"),
    [sagawaColumn("recipientName1"), sagawaColumn("recipientName2")],
    [sagawaColumn("recipientAddress1"), sagawaColumn("recipientAddress2"), sagawaColumn("recipientAddress3")],
    recipientContact(order),
  );
  writeContact(
    cells,
    issues,
    sagawaColumn("senderPhone"),
    sagawaColumn("senderPostal"),
    [sagawaColumn("senderName1"), sagawaColumn("senderName2")],
    [sagawaColumn("senderAddress1"), sagawaColumn("senderAddress2")],
    senderContact(settings),
  );
  writeItems(cells, issues, order);
  return { cells, issues };
}

export function sagawaPreview(cells: readonly string[]): { label: string; value: string }[] {
  return previewLines(cells, sagawaColumn, PREVIEW_KEYS);
}

function writeItems(cells: string[], issues: Issue[], order: NormalizedOrder): void {
  flagTruncatedItems(issues, order, "itemName1");
  writePacked(cells, issues, ITEM_KEYS.map((key) => sagawaColumn(key)), order.lineItems.join("、"), true);
}
