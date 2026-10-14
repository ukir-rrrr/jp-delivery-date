import type { LocalDate } from "./local-date";

/**
 * Merchant-editable holiday set. Seed source and licence are unverified [U].
 * New Year preset (12/29–1/3) is applied by the calendar, not stored as raw dates.
 */
export type HolidaySet = ReadonlySet<LocalDate>;

export function holidaySet(dates: readonly LocalDate[]): HolidaySet {
  return new Set(dates);
}

export function isHoliday(holidays: HolidaySet, date: LocalDate): boolean {
  return holidays.has(date);
}
