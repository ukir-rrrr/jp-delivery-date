import { addCalendarDays, type LocalDate } from "../calendar/local-date";
import {
  addBusinessDays,
  isClosedShipDay,
  type BusinessCalendar,
} from "../calendar/business-calendar";
import { holidaySet } from "../calendar/holidays";
import { jstDateTime } from "../calendar/jst";
import { readSettingsV1, type SettingsV1 } from "./settings";
import { prefectureByCode, type PrefectureCode } from "./region";

/** Instant with an explicit IANA zone. Callers inject `now` — never read the clock here. */
export interface ZonedInstant {
  epochMs: number;
  timeZone: "Asia/Tokyo";
}

export interface CartItem {
  productId: string;
  leadTimeDays: number;
}

export interface Reason {
  code: string;
  detail: string;
}

export interface EarliestDateInput {
  now: ZonedInstant;
  settings: SettingsV1;
  items: CartItem[];
  prefecture?: PrefectureCode | string;
}

export interface EarliestDateResult {
  earliest: LocalDate | null;
  selectable: LocalDate[];
  reasons: Reason[];
}

const CUTOFF = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Order of steps (also shown in the settings UI):
 * 1. Cutoff in JST. At or after the cutoff, shipping starts tomorrow.
 * 2. Max per-product lead time, counted in shipping business days.
 * 3. Region offset in calendar days. Unknown prefecture uses the slowest
 *    configured region (max of the default and every prefecture value).
 * 4. If that arrival falls on a closed ship day, move forward to the next
 *    open one. Then offer the selectable window.
 *
 * A closed calendar (holidays, New Year 12/29–1/3, closed weekdays) never
 * loops: the search stops after a finite horizon and returns no date.
 */
export function earliestDate(input: EarliestDateInput): EarliestDateResult {
  const cutoff = cutoffMinutes(input.settings.cutoff);
  const invalid = invalidInput(input);
  if (invalid || cutoff === null) {
    return {
      earliest: null,
      selectable: [],
      reasons: [{ code: "invalid_input", detail: invalid ?? "cutoff must be HH:mm" }],
    };
  }

  const reasons: Reason[] = [];
  const clock = jstDateTime(input.now.epochMs);
  const pastCutoff = clock.minutes >= cutoff;
  const origin = pastCutoff ? addCalendarDays(clock.date, 1) : clock.date;
  reasons.push({
    code: pastCutoff ? "past_cutoff" : "before_cutoff",
    detail: pastCutoff
      ? `${formatMinutes(clock.minutes)} >= ${input.settings.cutoff}`
      : `${formatMinutes(clock.minutes)} < ${input.settings.cutoff}`,
  });

  const lead = maxLead(input.items);
  const calendar = calendarOf(input.settings);
  const ship = addBusinessDays(calendar, origin, lead, horizonFor(lead));
  reasons.push({
    code: "lead_time",
    detail: ship
      ? `max lead ${lead} shipping business days, ship ${ship}`
      : `max lead ${lead} shipping business days`,
  });
  if (!ship) {
    reasons.push({
      code: "all_closed_horizon",
      detail: "no open shipping day within horizon",
    });
    return { earliest: null, selectable: [], reasons };
  }

  const region = regionOffset(input.settings, input.prefecture);
  reasons.push({ code: region.code, detail: region.detail });
  const arrival = addCalendarDays(ship, region.days);
  const earliest = addBusinessDays(calendar, arrival, 0);
  if (!earliest) {
    reasons.push({
      code: "all_closed_horizon",
      detail: "no open delivery day within horizon after region offset",
    });
    return { earliest: null, selectable: [], reasons };
  }
  if (earliest !== arrival) {
    reasons.push({
      code: "snapped_to_open_day",
      detail: `${arrival} is closed, moved to ${earliest}`,
    });
  }

  return {
    earliest,
    selectable: openDaysInWindow(
      calendar,
      earliest,
      input.settings.selectableWindowDays,
    ),
    reasons,
  };
}

function invalidInput(input: EarliestDateInput): string | null {
  if (input.now.timeZone !== "Asia/Tokyo" || !Number.isFinite(input.now.epochMs)) {
    return "now must be a finite Asia/Tokyo instant";
  }
  if (!readSettingsV1(input.settings)) return "settings are invalid";
  for (const item of input.items) {
    if (!isNonNegativeInt(item.leadTimeDays)) {
      return `leadTimeDays must be a non-negative integer, got ${String(item.leadTimeDays)}`;
    }
  }
  return null;
}

function cutoffMinutes(cutoff: string): number | null {
  const match = CUTOFF.exec(cutoff);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function maxLead(items: readonly CartItem[]): number {
  let lead = 0;
  for (const item of items) lead = Math.max(lead, item.leadTimeDays);
  return lead;
}

function calendarOf(settings: SettingsV1): BusinessCalendar {
  return {
    holidays: holidaySet(settings.holidays),
    closedWeekdays: settings.closedWeekdays,
    newYearPreset: settings.newYearPreset,
  };
}

/**
 * One open ship day per week needs 7 calendar days per lead day, plus a year
 * of slack so a long holiday run still terminates with null instead of looping.
 */
function horizonFor(lead: number): number {
  return 366 + lead * 7;
}

function regionOffset(
  settings: SettingsV1,
  prefecture: string | undefined,
): { days: number; code: "unknown_prefecture" | "region_days"; detail: string } {
  if (prefecture && prefectureByCode(prefecture)) {
    if (Object.hasOwn(settings.prefectureLeadDays, prefecture)) {
      const days = settings.prefectureLeadDays[prefecture] ?? 0;
      return {
        days,
        code: "region_days",
        detail: `prefecture ${prefecture} +${days} calendar days`,
      };
    }
    return {
      days: settings.defaultRegionDays,
      code: "region_days",
      detail: `prefecture ${prefecture} uses default +${settings.defaultRegionDays} calendar days`,
    };
  }
  let slowest = settings.defaultRegionDays;
  for (const days of Object.values(settings.prefectureLeadDays)) {
    if (days > slowest) slowest = days;
  }
  return {
    days: slowest,
    code: "unknown_prefecture",
    detail: `using slowest region +${slowest} calendar days`,
  };
}

function openDaysInWindow(
  calendar: BusinessCalendar,
  earliest: LocalDate,
  windowDays: number,
): LocalDate[] {
  const selectable: LocalDate[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const candidate = addCalendarDays(earliest, i);
    if (!isClosedShipDay(calendar, candidate)) selectable.push(candidate);
  }
  return selectable;
}
