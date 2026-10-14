import type { LocalDate } from "../calendar/local-date";
import type { NormalizedOrder } from "./normalized-order";

export const ORDER_LIST_STATUSES = ["all", "unexported", "exported", "needs_review"] as const;
export type OrderListStatus = (typeof ORDER_LIST_STATUSES)[number];

export interface OrderListFilter {
  status: OrderListStatus;
  deliveryDate: LocalDate | null;
  missingDate: boolean;
}

export function parseOrderListStatus(value: string | null): OrderListStatus {
  if (value && (ORDER_LIST_STATUSES as readonly string[]).includes(value)) {
    return value as OrderListStatus;
  }
  return "all";
}

export function orderMatchesFilter(
  row: { order: NormalizedOrder; exported: boolean; hasIssues: boolean },
  filter: OrderListFilter,
): boolean {
  if (filter.missingDate) {
    if (row.order.deliveryDate !== null) return false;
  } else if (filter.deliveryDate && row.order.deliveryDate !== filter.deliveryDate) {
    return false;
  }
  if (filter.status === "unexported" && row.exported) return false;
  if (filter.status === "exported" && !row.exported) return false;
  if (filter.status === "needs_review" && !row.hasIssues) return false;
  return true;
}
