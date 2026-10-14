import { formatSlashDate, type LocalDate } from "../calendar/local-date";
import {
  ATTR_DATE_KEY,
  ATTR_DATE_LABEL,
  ATTR_SLOT_KEY,
  ATTR_SLOT_LABEL,
  ATTR_VERSION_KEY,
} from "./attributes";
import { SLOT_LABELS_JA } from "./labels";
import { isSlot, type Slot } from "./slot";

export const DELIVERY_ATTRIBUTE_VERSION = "1";

export interface SelectionIssue {
  code:
    | "date_required"
    | "slot_required"
    | "date_not_selectable"
    | "slot_not_offered";
  detail: string;
}

export interface SelectionValidation {
  ok: boolean;
  issues: SelectionIssue[];
}

/**
 * A blank date and slot is "no preference" unless the merchant marked the
 * field required. A partial choice is never valid.
 */
export function validateSelection(input: {
  required: boolean;
  date: string;
  slot: string;
  selectable: readonly string[];
  offeredSlots: readonly string[];
}): SelectionValidation {
  const date = input.date.trim();
  const slot = input.slot.trim();
  const issues: SelectionIssue[] = [];

  if (!date && !slot) {
    if (input.required) {
      issues.push({
        code: "date_required",
        detail: "delivery date is required",
      });
    }
    return { ok: issues.length === 0, issues };
  }

  if (!date) {
    issues.push({
      code: "date_required",
      detail: "time slot was chosen without a date",
    });
  } else if (!input.selectable.includes(date)) {
    issues.push({ code: "date_not_selectable", detail: date });
  }

  if (input.offeredSlots.length === 0) {
    if (slot) {
      issues.push({
        code: "slot_not_offered",
        detail: "no time slots are configured",
      });
    }
  } else if (!slot) {
    issues.push({
      code: "slot_required",
      detail: "time slot is required when a date is chosen",
    });
  } else if (!isSlot(slot) || !input.offeredSlots.includes(slot)) {
    issues.push({ code: "slot_not_offered", detail: slot });
  }

  return { ok: issues.length === 0, issues };
}

export function buildDeliveryAttributes(
  date: LocalDate,
  slot: Slot,
): Record<string, string> {
  return {
    [ATTR_DATE_LABEL]: formatSlashDate(date),
    [ATTR_SLOT_LABEL]: SLOT_LABELS_JA[slot],
    [ATTR_DATE_KEY]: date,
    [ATTR_SLOT_KEY]: slot,
    [ATTR_VERSION_KEY]: DELIVERY_ATTRIBUTE_VERSION,
  };
}

export function clearDeliveryAttributes(): Record<string, string> {
  return {
    [ATTR_DATE_LABEL]: "",
    [ATTR_SLOT_LABEL]: "",
    [ATTR_DATE_KEY]: "",
    [ATTR_SLOT_KEY]: "",
    [ATTR_VERSION_KEY]: "",
  };
}
