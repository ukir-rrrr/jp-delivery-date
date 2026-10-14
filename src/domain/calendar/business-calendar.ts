import type { LocalDate } from "./local-date";
import { addCalendarDays } from "./local-date";
import type { HolidaySet } from "./holidays";
import { isHoliday } from "./holidays";

/** JS weekday: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BusinessCalendar {
  holidays: HolidaySet;
  closedWeekdays: readonly Weekday[];
  newYearPreset: boolean;
}

export function weekdayOf(date: LocalDate): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

function isNewYearPresetDay(date: LocalDate): boolean {
  const monthDay = date.slice(5);
  return monthDay >= "12-29" || monthDay <= "01-03";
}

export function isClosedShipDay(
  calendar: BusinessCalendar,
  date: LocalDate,
): boolean {
  if (calendar.closedWeekdays.includes(weekdayOf(date))) return true;
  if (isHoliday(calendar.holidays, date)) return true;
  if (calendar.newYearPreset && isNewYearPresetDay(date)) return true;
  return false;
}

/**
 * `days === 0`: first open ship day on or after `start`.
 * `days > 0`: that origin plus N additional open ship days.
 * Never loops forever: all-closed horizon returns null.
 */
export function addBusinessDays(
  calendar: BusinessCalendar,
  start: LocalDate,
  days: number,
  horizonDays = 366,
): LocalDate | null {
  if (days < 0) {
    throw new Error(`addBusinessDays: days must be >= 0, got ${days}`);
  }
  let cursor = start;
  let remaining = days;
  for (let i = 0; i < horizonDays; i += 1) {
    if (!isClosedShipDay(calendar, cursor)) {
      if (remaining === 0) return cursor;
      remaining -= 1;
    }
    cursor = addCalendarDays(cursor, 1);
  }
  return null;
}
