import { parseLocalDate, type LocalDate } from "./local-date";

/** Japan has no DST; JST is a fixed +09:00 offset. */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface JstDateTime {
  date: LocalDate;
  /** Minutes since midnight in JST, 0–1439. Seconds are truncated. */
  minutes: number;
}

/**
 * Civil date and clock time in Asia/Tokyo for an injected epoch.
 * Uses UTC getters on the shifted instant so the host timezone cannot leak in.
 */
export function jstDateTime(epochMs: number): JstDateTime {
  if (!Number.isFinite(epochMs)) {
    throw new Error("epochMs must be finite");
  }
  const shifted = new Date(epochMs + JST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const date = parseLocalDate(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  );
  return {
    date,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}
