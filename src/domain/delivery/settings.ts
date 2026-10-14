import { parseLocalDate, type LocalDate } from "../calendar/local-date";
import type { Weekday } from "../calendar/business-calendar";
import { isSlot, type Slot } from "./slot";

export interface SenderProfile {
  name?: string;
  postalCode?: string;
  prefecture?: string;
  address1?: string;
  address2?: string;
  phone?: string;
  /** Yamato B2 ご請求先顧客コード. Merchant account data, not buyer PII. */
  yamatoBillingCode?: string;
  /** Yamato B2 運賃管理番号. Merchant account data, not buyer PII. */
  yamatoFreightNumber?: string;
}

export interface SettingsV1 {
  schemaVersion: 1;
  holidays: LocalDate[];
  newYearPreset: boolean;
  closedWeekdays: Weekday[];
  /** HH:mm in JST. Orders at or after this cutoff start from tomorrow. */
  cutoff: string;
  slots: Slot[];
  /** Prefecture code → extra calendar days. Missing keys use defaultRegionDays. */
  prefectureLeadDays: Record<string, number>;
  /**
   * Calendar days used when a known prefecture has no override.
   * An unknown prefecture uses the max of this value and every override.
   */
  defaultRegionDays: number;
  selectableWindowDays: number;
  sender: SenderProfile;
}

const WEEKDAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

/**
 * Storefront parser for the settings metafield. Returns null when the payload
 * is present but not a valid SettingsV1, so the cart can fail closed.
 * A missing metafield is the caller's concern: pass DEFAULT_SETTINGS_V1 then.
 */
export function readSettingsV1(raw: unknown): SettingsV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== 1) return null;
  if (!Array.isArray(value.holidays)) return null;
  const holidays: LocalDate[] = [];
  for (const holiday of value.holidays) {
    if (typeof holiday !== "string") return null;
    try {
      holidays.push(parseLocalDate(holiday));
    } catch {
      return null;
    }
  }
  if (typeof value.newYearPreset !== "boolean") return null;
  if (!Array.isArray(value.closedWeekdays)) return null;
  const closedWeekdays: Weekday[] = [];
  for (const day of value.closedWeekdays) {
    if (typeof day !== "number" || !WEEKDAYS.has(day)) return null;
    closedWeekdays.push(day as Weekday);
  }
  if (typeof value.cutoff !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.cutoff)) {
    return null;
  }
  if (!Array.isArray(value.slots)) return null;
  const slots: Slot[] = [];
  for (const slot of value.slots) {
    if (typeof slot !== "string" || !isSlot(slot)) return null;
    slots.push(slot);
  }
  if (!value.prefectureLeadDays || typeof value.prefectureLeadDays !== "object" || Array.isArray(value.prefectureLeadDays)) {
    return null;
  }
  const prefectureLeadDays: Record<string, number> = {};
  for (const [code, days] of Object.entries(value.prefectureLeadDays)) {
    if (!isNonNegativeInt(days)) return null;
    prefectureLeadDays[code] = days;
  }
  if (!isNonNegativeInt(value.defaultRegionDays)) return null;
  if (!isNonNegativeInt(value.selectableWindowDays) || value.selectableWindowDays < 1 || value.selectableWindowDays > 366) {
    return null;
  }
  const sender = readSender(value.sender);
  if (!sender) return null;
  return {
    schemaVersion: 1,
    holidays,
    newYearPreset: value.newYearPreset,
    closedWeekdays,
    cutoff: value.cutoff,
    slots,
    prefectureLeadDays,
    defaultRegionDays: value.defaultRegionDays,
    selectableWindowDays: value.selectableWindowDays,
    sender,
  };
}

function readSender(raw: unknown): SettingsV1["sender"] | null {
  if (raw === undefined) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sender: SettingsV1["sender"] = {};
  for (const key of [
    "name",
    "postalCode",
    "prefecture",
    "address1",
    "address2",
    "phone",
    "yamatoBillingCode",
    "yamatoFreightNumber",
  ] as const) {
    const field = (raw as Record<string, unknown>)[key];
    if (field === undefined) continue;
    if (typeof field !== "string") return null;
    sender[key] = field;
  }
  return sender;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export const DEFAULT_SETTINGS_V1: SettingsV1 = {
  schemaVersion: 1,
  holidays: [],
  newYearPreset: true,
  closedWeekdays: [0],
  cutoff: "15:00",
  slots: [
    "morning",
    "afternoon_early",
    "afternoon_late",
    "evening",
    "night",
  ],
  prefectureLeadDays: {},
  defaultRegionDays: 2,
  selectableWindowDays: 30,
  sender: {},
};
