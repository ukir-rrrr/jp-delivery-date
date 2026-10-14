import { parseLocalDate } from "../calendar/local-date";
import { isSlot } from "../delivery/slot";
import type { NormalizedOrder } from "./normalized-order";

export interface DeliveryEdit {
  date: string;
  slot: string;
}

export function applyDeliveryEdit(
  order: NormalizedOrder,
  edit: DeliveryEdit,
): { ok: true; order: NormalizedOrder } | { ok: false; message: string } {
  let deliveryDate = order.deliveryDate;
  let slot = order.slot;
  if (edit.date === "") {
    deliveryDate = null;
  } else {
    try {
      deliveryDate = parseLocalDate(edit.date);
    } catch {
      return { ok: false, message: `${order.orderName || order.orderId}の配達希望日は YYYY-MM-DD です。` };
    }
  }
  if (edit.slot === "") {
    slot = "unspecified";
  } else if (isSlot(edit.slot)) {
    slot = edit.slot;
  } else {
    return { ok: false, message: `${order.orderName || order.orderId}の時間帯が不正です。` };
  }
  const missing = deliveryDate === null && slot === "unspecified";
  return {
    ok: true,
    order: {
      ...order,
      deliveryDate,
      slot,
      missingDeliveryPreference: missing,
      needsReview: order.pcdRedacted || deliveryDate === null,
    },
  };
}
