import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  parseLocalDate,
} from "../../src/domain/calendar/local-date";

describe("parseLocalDate", () => {
  it("accepts a valid JST calendar date", () => {
    expect(parseLocalDate("2026-10-14")).toBe("2026-10-14");
  });

  it("rejects an impossible calendar date", () => {
    expect(() => parseLocalDate("2026-02-30")).toThrow(/Invalid LocalDate/);
  });
});

describe("addCalendarDays", () => {
  it("crosses a month boundary without using the host timezone", () => {
    const start = parseLocalDate("2026-01-31");
    expect(addCalendarDays(start, 1)).toBe("2026-02-01");
  });

  it("handles a leap day", () => {
    const start = parseLocalDate("2024-02-28");
    expect(addCalendarDays(start, 1)).toBe("2024-02-29");
    expect(addCalendarDays(start, 2)).toBe("2024-03-01");
  });
});
