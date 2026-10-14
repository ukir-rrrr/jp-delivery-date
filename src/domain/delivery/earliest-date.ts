import type { LocalDate } from "../calendar/local-date";
import { addCalendarDays, parseLocalDate } from "../calendar/local-date";
import {
  addBusinessDays,
  isClosedShipDay,
  type BusinessCalendar,
} from "../calendar/business-calendar";
import { holidaySet } from "../calendar/holidays";
import type { SettingsV1 } from "./settings";
import type { PrefectureCode } from "./region";

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
  prefecture?: PrefectureCode;
}

export interface EarliestDateResult {
  earliest: LocalDate | null;
  selectable: LocalDate[];
  reasons: Reason[];
}

function jstYmd(now: ZonedInstant): { date: LocalDate; hhmm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: now.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(now.epochMs)).map((p) => [p.type, p.value]),
  );
  const date = parseLocalDate(`${parts.year}-${parts.month}-${parts.day}`);
  const hhmm = `${parts.hour}:${parts.minute}`;
  return { date, hhmm };
}

function calendarOf(settings: SettingsV1): BusinessCalendar {
  return {
    holidays: holidaySet(settings.holidays),
    closedWeekdays: settings.closedWeekdays,
    newYearPreset: settings.newYearPreset,
  };
}

/**
 * Order of steps (also shown in the settings UI):
 * 1. If past cutoff, start tomorrow
 * 2. Add max(lead time) in shipping business days
 * 3. Add region days in calendar days (worst case when prefecture unknown)
 * 4. Apply selectable window (e.g. +30)
 *
 * Scaffold: implemented enough to be testable; table-driven cases land in W2.
 */
export function earliestDate(input: EarliestDateInput): EarliestDateResult {
  const reasons: Reason[] = [];
  const { date: today, hhmm } = jstYmd(input.now);
  let start = today;

  if (hhmm >= input.settings.cutoff) {
    start = addCalendarDays(today, 1);
    reasons.push({
      code: "past_cutoff",
      detail: `now ${hhmm} >= cutoff ${input.settings.cutoff}`,
    });
  } else {
    reasons.push({
      code: "before_cutoff",
      detail: `now ${hhmm} < cutoff ${input.settings.cutoff}`,
    });
  }

  const lead = input.items.reduce(
    (max, item) => Math.max(max, item.leadTimeDays),
    0,
  );
  reasons.push({ code: "lead_time", detail: `max lead ${lead} business days` });

  const calendar = calendarOf(input.settings);
  const afterLead = addBusinessDays(calendar, start, lead);
  if (!afterLead) {
    reasons.push({
      code: "all_closed_horizon",
      detail: "no open shipping day within horizon",
    });
    return { earliest: null, selectable: [], reasons };
  }

  const regionDays = input.prefecture
    ? (input.settings.prefectureLeadDays[input.prefecture] ??
      input.settings.defaultRegionDays)
    : input.settings.defaultRegionDays;
  if (!input.prefecture) {
    reasons.push({
      code: "unknown_prefecture",
      detail: `using worst-case region days ${regionDays}`,
    });
  } else {
    reasons.push({
      code: "region_days",
      detail: `prefecture ${input.prefecture} +${regionDays} calendar days`,
    });
  }

  const afterRegion = addCalendarDays(afterLead, regionDays);
  const earliest = addBusinessDays(calendar, afterRegion, 0);
  if (!earliest) {
    reasons.push({
      code: "all_closed_horizon",
      detail: "no open shipping day within horizon after region offset",
    });
    return { earliest: null, selectable: [], reasons };
  }

  const selectable: LocalDate[] = [];
  const window = input.settings.selectableWindowDays;
  for (let i = 0; i < window; i += 1) {
    const candidate = addCalendarDays(earliest, i);
    if (!isClosedShipDay(calendar, candidate)) {
      selectable.push(candidate);
    }
  }

  return { earliest, selectable, reasons };
}
