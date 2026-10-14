import type { SettingsV1 } from "../delivery/settings";
import { serializeCsv } from "../encoding/csv";
import { encodeCsv } from "../encoding/encode";
import type { NormalizedOrder } from "../order/normalized-order";
import type { CarrierAdapter, Issue, Result } from "./adapter";

export interface LabelFailure {
  orderId: string;
  orderName: string;
  issues: Issue[];
}

export function buildLabelFile(
  adapter: CarrierAdapter,
  orders: readonly NormalizedOrder[],
  settings: SettingsV1,
): Result<Uint8Array, LabelFailure[]> {
  if (orders.length === 0) {
    return {
      ok: false,
      error: [{ orderId: "", orderName: "", issues: [{ code: "empty", message: "注文が選ばれていません。" }] }],
    };
  }
  const failures: LabelFailure[] = [];
  const rows: string[][] = [adapter.columns.map((column) => column.label)];
  for (const order of orders) {
    const result = adapter.toRow(order, settings);
    if (!result.ok) {
      failures.push({ orderId: order.orderId, orderName: order.orderName, issues: result.error });
      continue;
    }
    rows.push(result.value);
  }
  if (failures.length > 0) return { ok: false, error: failures };
  return { ok: true, value: encodeCsv(serializeCsv(rows), adapter.encoding).bytes };
}
