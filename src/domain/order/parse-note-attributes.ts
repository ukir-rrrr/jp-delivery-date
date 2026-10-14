import { parseLocalDate, type LocalDate } from "../calendar/local-date";
import { isSlot, type Slot } from "../delivery/slot";
import type { NormalizedOrder } from "./normalized-order";

export interface NoteAttribute {
  key: string;
  value: string | null;
}

export const ATTR_DATE_LABEL = "配達希望日";
export const ATTR_SLOT_LABEL = "配達時間帯";
export const ATTR_DATE_KEY = "_delivery_date";
export const ATTR_SLOT_KEY = "_delivery_slot";
export const ATTR_VERSION_KEY = "_delivery_v";

function attrMap(attrs: readonly NoteAttribute[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const attr of attrs) {
    if (attr.value != null && attr.value !== "") {
      map.set(attr.key, attr.value);
    }
  }
  return map;
}

export function parseDeliveryChoice(attrs: readonly NoteAttribute[]): {
  date: LocalDate | null;
  slot: Slot;
  missing: boolean;
} {
  const map = attrMap(attrs);
  const rawDate = map.get(ATTR_DATE_KEY) ?? map.get(ATTR_DATE_LABEL);
  const rawSlot = map.get(ATTR_SLOT_KEY) ?? map.get(ATTR_SLOT_LABEL);

  let date: LocalDate | null = null;
  if (rawDate) {
    try {
      date = parseLocalDate(rawDate);
    } catch {
      date = null;
    }
  }

  const slot: Slot = rawSlot && isSlot(rawSlot) ? rawSlot : "unspecified";
  const missing = date === null && slot === "unspecified";
  return { date, slot, missing };
}

export function emptyNormalizedOrder(
  orderId: string,
  extras: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    orderId,
    name: "",
    phone: "",
    address: { postalCode: "", province: "", city: "", address1: "", address2: "" },
    deliveryDate: null,
    slot: "unspecified",
    missingDeliveryPreference: true,
    pcdRedacted: false,
    needsReview: true,
    ...extras,
  };
}
