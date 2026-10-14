import { formatSlashDate, type LocalDate } from "../../calendar/local-date";
import type { SettingsV1 } from "../../delivery/settings";
import type { Slot } from "../../delivery/slot";
import { serializeCsv } from "../../encoding/csv";
import { encodeCsv } from "../../encoding/encode";
import type { NormalizedOrder } from "../../order/normalized-order";
import type { CarrierAdapter, Issue, Result, Row } from "../adapter";
import { YAMATO_COLUMNS, YAMATO_SLOT_CODES, yamatoHeader } from "./columns";
import { yamatoRow } from "./map-row";

export { YAMATO_B2_SPEC, YAMATO_COLUMNS, yamatoColumn, yamatoHeader } from "./columns";
export { yamatoPreview, yamatoRow } from "./map-row";

/**
 * B2 Cloud label CSV.
 * Encoding: the layout PDF does not name one (see YAMATO_B2_SPEC). Shift_JIS
 * is used so a character outside JIS level 1/2 cannot be written by CP932.
 */
export const yamatoAdapter: CarrierAdapter = {
  id: "yamato",
  columns: YAMATO_COLUMNS,
  encoding: "shift_jis",
  mapSlot(slot: Slot) {
    return YAMATO_SLOT_CODES[slot];
  },
  formatDate(date: LocalDate) {
    return formatSlashDate(date);
  },
  toRow(order: NormalizedOrder, settings: SettingsV1): Result<Row, Issue[]> {
    const view = yamatoRow(order, settings);
    if (view.issues.length > 0) return { ok: false, error: view.issues };
    return { ok: true, value: view.cells };
  },
};

export interface YamatoFailure {
  orderId: string;
  orderName: string;
  issues: Issue[];
}

export function buildYamatoFile(
  orders: readonly NormalizedOrder[],
  settings: SettingsV1,
): Result<Uint8Array, YamatoFailure[]> {
  if (orders.length === 0) {
    return {
      ok: false,
      error: [{ orderId: "", orderName: "", issues: [{ code: "empty", message: "注文が選ばれていません。" }] }],
    };
  }
  const failures: YamatoFailure[] = [];
  const rows: string[][] = [yamatoHeader()];
  for (const order of orders) {
    const result = yamatoAdapter.toRow(order, settings);
    if (!result.ok) {
      failures.push({ orderId: order.orderId, orderName: order.orderName, issues: result.error });
      continue;
    }
    rows.push(result.value);
  }
  if (failures.length > 0) return { ok: false, error: failures };
  return { ok: true, value: encodeCsv(serializeCsv(rows), yamatoAdapter.encoding).bytes };
}
