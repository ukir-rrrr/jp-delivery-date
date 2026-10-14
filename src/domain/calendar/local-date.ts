/**
 * Date-only value in JST calendar space (YYYY-MM-DD).
 * Arithmetic uses UTC date components so browser-local `Date` never leaks in.
 */
export type LocalDate = string & { readonly __brand: "LocalDate" };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utcDateParts(value: LocalDate): { y: number; m: number; d: number } {
  const match = DATE_RE.exec(value);
  if (!match) {
    throw new Error(`Invalid LocalDate: ${value}`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function parseLocalDate(value: string): LocalDate {
  const match = DATE_RE.exec(value);
  if (!match) {
    throw new Error(`Invalid LocalDate: ${value}`);
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (
    utc.getUTCFullYear() !== y ||
    utc.getUTCMonth() !== m - 1 ||
    utc.getUTCDate() !== d
  ) {
    throw new Error(`Invalid LocalDate: ${value}`);
  }
  return value as LocalDate;
}

export function addCalendarDays(date: LocalDate, days: number): LocalDate {
  const { y, m, d } = utcDateParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = String(utc.getUTCFullYear()).padStart(4, "0");
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}` as LocalDate;
}

export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function formatSlashDate(date: LocalDate): string {
  const { y, m, d } = utcDateParts(date);
  return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
}

export function formatCompactDate(date: LocalDate): string {
  return date.replaceAll("-", "");
}
