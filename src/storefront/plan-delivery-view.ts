import { PREFECTURES } from "@domain/delivery/region";
import {
  buildDeliveryAttributes,
  clearDeliveryAttributes,
  validateSelection,
} from "@domain/delivery/selection";
import {
  earliestDate,
  type CartItem,
  type Reason,
  type ZonedInstant,
} from "@domain/delivery/earliest-date";
import type { SettingsV1 } from "@domain/delivery/settings";
import { formatDeliveryDateLabel, slotLabel } from "@domain/delivery/labels";
import { isSlot, type Slot } from "@domain/delivery/slot";

export type PlanIssueCode =
  | "settings_invalid"
  | "lead_time_unknown"
  | "no_dates"
  | "date_required"
  | "slot_required"
  | "date_not_selectable"
  | "slot_not_offered";

export interface PlanIssue {
  code: PlanIssueCode;
  detail: string;
}

export interface DeliveryPlanInput {
  now: ZonedInstant;
  /** Null when the metafield was present but invalid. */
  settings: SettingsV1 | null;
  /** Null when a cart product's lead time is not known yet. */
  items: CartItem[] | null;
  prefecture: string;
  required: boolean;
  locale: string;
  date: string;
  slot: string;
}

export interface LabeledValue {
  value: string;
  label: string;
}

export interface DeliveryPlan {
  dates: LabeledValue[];
  slots: LabeledValue[];
  prefectures: LabeledValue[];
  date: string;
  slot: string;
  issues: PlanIssue[];
  reasons: Reason[];
  checkoutLocked: boolean;
  /**
   * Attributes to write. Null leaves the cart untouched (partial choice,
   * or the inputs are not safe to judge).
   */
  attributes: Record<string, string> | null;
}

export function planDeliveryView(input: DeliveryPlanInput): DeliveryPlan {
  const prefectures = PREFECTURES.map((prefecture) => ({
    value: prefecture.code,
    label: prefecture.name,
  }));
  const blank = {
    dates: [] as LabeledValue[],
    slots: [] as LabeledValue[],
    prefectures,
    date: "",
    slot: "",
    reasons: [] as Reason[],
  };

  if (!input.settings) {
    return held(blank, input.required, {
      code: "settings_invalid",
      detail: "settings are invalid",
    });
  }
  if (!input.items) {
    return held(blank, input.required, {
      code: "lead_time_unknown",
      detail: "lead time is unknown for a cart product",
    });
  }

  const result = earliestDate({
    now: input.now,
    settings: input.settings,
    items: input.items,
    prefecture: input.prefecture || undefined,
  });
  const slots = uniqueSlots(input.settings.slots);
  const slotChoices = slots.map((slot) => ({
    value: slot,
    label: slotLabel(slot, input.locale),
  }));
  const dates = result.selectable.map((date) => ({
    value: date,
    label: formatDeliveryDateLabel(date, input.locale),
  }));
  const view = { ...blank, dates, slots: slotChoices, reasons: result.reasons };

  if (!result.earliest) {
    return {
      ...view,
      issues: [{ code: "no_dates", detail: "no open delivery day" }],
      checkoutLocked: input.required,
      attributes: clearDeliveryAttributes(),
    };
  }

  const date = input.date.trim();
  const slot = input.slot.trim();
  if (date && !result.selectable.some((candidate) => candidate === date)) {
    return {
      ...view,
      issues: [{ code: "date_not_selectable", detail: date }],
      checkoutLocked: input.required,
      attributes: clearDeliveryAttributes(),
    };
  }

  const validation = validateSelection({
    required: input.required,
    date,
    slot,
    selectable: result.selectable,
    offeredSlots: slots,
  });
  if (!date && !slot) {
    return {
      ...view,
      issues: validation.issues,
      checkoutLocked: input.required,
      attributes: clearDeliveryAttributes(),
    };
  }
  if (!validation.ok) {
    return {
      ...view,
      date,
      slot,
      issues: validation.issues,
      checkoutLocked: true,
      attributes: null,
    };
  }

  const chosen = result.selectable.find((candidate) => candidate === date);
  const storedSlot: Slot = slots.length === 0 ? "unspecified" : (slot as Slot);
  if (!chosen || !isSlot(storedSlot)) {
    return {
      ...view,
      date,
      slot,
      issues: validation.issues,
      checkoutLocked: true,
      attributes: null,
    };
  }
  return {
    ...view,
    date,
    slot,
    issues: [],
    checkoutLocked: false,
    attributes: buildDeliveryAttributes(chosen, storedSlot),
  };
}

function held(
  view: Pick<DeliveryPlan, "dates" | "slots" | "prefectures" | "date" | "slot" | "reasons">,
  required: boolean,
  issue: PlanIssue,
): DeliveryPlan {
  return {
    ...view,
    issues: [issue],
    checkoutLocked: required,
    attributes: null,
  };
}

function uniqueSlots(slots: readonly Slot[]): Slot[] {
  const seen = new Set<Slot>();
  const unique: Slot[] = [];
  for (const slot of slots) {
    if (seen.has(slot) || slot === "unspecified") continue;
    seen.add(slot);
    unique.push(slot);
  }
  return unique;
}
