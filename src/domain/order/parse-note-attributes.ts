import { parseLocalDate, type LocalDate } from "../calendar/local-date";
import {
  ATTR_DATE_KEY,
  ATTR_DATE_LABEL,
  ATTR_SLOT_KEY,
  ATTR_SLOT_LABEL,
} from "../delivery/attributes";
import { slotFromLabel } from "../delivery/labels";
import { isSlot, type Slot } from "../delivery/slot";
import type { NormalizedOrder } from "./normalized-order";

export interface NoteAttribute {
  key: string;
  value: string | null;
}

export {
  ATTR_DATE_LABEL,
  ATTR_SLOT_LABEL,
  ATTR_DATE_KEY,
  ATTR_SLOT_KEY,
  ATTR_VERSION_KEY,
} from "../delivery/attributes";

function parseDateValue(raw: string): LocalDate | null {
  const normalized = raw.trim().replaceAll("/", "-");
  try {
    return parseLocalDate(normalized);
  } catch {
    return null;
  }
}

function parseSlotValue(raw: string | undefined): Slot {
  if (!raw) return "unspecified";
  const trimmed = raw.trim();
  if (isSlot(trimmed)) return trimmed;
  return slotFromLabel(trimmed) ?? "unspecified";
}

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
    date = parseDateValue(rawDate);
  }

  const slot = parseSlotValue(rawSlot);
  const missing = date === null && slot === "unspecified";
  return { date, slot, missing };
}

export function emptyNormalizedOrder(
  orderId: string,
  extras: Partial<NormalizedOrder> = {},
): NormalizedOrder {
  return {
    orderId,
    orderName: "",
    name: "",
    phone: "",
    address: { postalCode: "", province: "", city: "", address1: "", address2: "" },
    deliveryDate: null,
    slot: "unspecified",
    shipDate: null,
    lineItems: [],
    lineItemsTruncated: false,
    missingDeliveryPreference: true,
    pcdRedacted: false,
    needsReview: true,
    ...extras,
  };
}
