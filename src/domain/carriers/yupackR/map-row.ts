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
import { YUPACK_COLUMNS, YUPACK_SLOT_CODES, yupackColumn } from "./columns";

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

/**
 * Clean 20-column layout. The import filter maps each header to the 発送予定
 * item of the same name (入出力インターフェース仕様書 pp.1-1–1-3).
 * Dates are YYYYMMDD because those fields are 8 bytes (p.1-1 No.19, p.1-3 No.105)
 * and YYYYMMDD is an accepted date form (p.8-1).
 * 配達時間帯区分 uses ゆうプリR設定値 (p.7-1). 00 is 希望しない.
 * A missing 配達希望日 is flagged instead of left blank.
 */
export function yupackRow(order: NormalizedOrder, settings: SettingsV1): RowView {
  const cells = blankCells(YUPACK_COLUMNS.length);
  const issues: Issue[] = [];
  if (order.pcdRedacted) {
    issues.push(pcdRedactedIssue());
    return { cells, issues };
  }

  writeCapped(cells, issues, yupackColumn("customerCode"), orderDigits(order.orderId));
  writeSchedule(cells, issues, order, yupackColumn("shipDate"), yupackColumn("deliveryDate"), formatCompactDate);
  putCell(cells, yupackColumn("timeSlot"), YUPACK_SLOT_CODES[order.slot]);
  writeContact(
    cells,
    issues,
    yupackColumn("recipientPhone"),
    yupackColumn("recipientPostal"),
    [yupackColumn("recipientName1"), yupackColumn("recipientName2")],
    [yupackColumn("recipientAddress1"), yupackColumn("recipientAddress2"), yupackColumn("recipientAddress3")],
    recipientContact(order),
  );
  writeContact(
    cells,
    issues,
    yupackColumn("senderPhone"),
    yupackColumn("senderPostal"),
    [yupackColumn("senderName1"), yupackColumn("senderName2")],
    [yupackColumn("senderAddress1"), yupackColumn("senderAddress2"), yupackColumn("senderAddress3")],
    senderContact(settings),
  );
  writeItems(cells, issues, order);
  return { cells, issues };
}

export function yupackPreview(cells: readonly string[]): { label: string; value: string }[] {
  return previewLines(cells, yupackColumn, PREVIEW_KEYS);
}

function writeItems(cells: string[], issues: Issue[], order: NormalizedOrder): void {
  flagTruncatedItems(issues, order, "itemName1");
  writePacked(
    cells,
    issues,
    [yupackColumn("itemName1"), yupackColumn("itemName2")],
    order.lineItems.join("、"),
    true,
  );
}
