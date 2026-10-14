import { weekdayOf } from "../calendar/business-calendar";
import type { LocalDate } from "../calendar/local-date";
import type { Slot } from "./slot";

/** Merchant-facing labels stored on the order. Japanese, regardless of the shopper locale. */
export const SLOT_LABELS_JA: Record<Slot, string> = {
  unspecified: "指定なし",
  morning: "午前中",
  afternoon_early: "14時〜16時",
  afternoon_late: "16時〜18時",
  evening: "18時〜20時",
  night: "19時〜21時",
};

const SLOT_LABELS_EN: Record<Slot, string> = {
  unspecified: "No preference",
  morning: "Morning",
  afternoon_early: "14:00–16:00",
  afternoon_late: "16:00–18:00",
  evening: "18:00–20:00",
  night: "19:00–21:00",
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function slotLabel(slot: Slot, locale: string): string {
  return locale.toLowerCase().startsWith("ja")
    ? SLOT_LABELS_JA[slot]
    : SLOT_LABELS_EN[slot];
}

export function slotFromLabel(value: string): Slot | undefined {
  const trimmed = value.trim();
  for (const [slot, label] of Object.entries(SLOT_LABELS_JA) as [Slot, string][]) {
    if (label === trimmed) return slot;
  }
  for (const [slot, label] of Object.entries(SLOT_LABELS_EN) as [Slot, string][]) {
    if (label === trimmed) return slot;
  }
  return undefined;
}

export function formatDeliveryDateLabel(date: LocalDate, locale: string): string {
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const weekday = weekdayOf(date);
  if (locale.toLowerCase().startsWith("ja")) {
    return `${year}年${month}月${day}日（${WEEKDAY_JA[weekday]}）`;
  }
  return `${WEEKDAY_EN[weekday]}, ${date}`;
}
