import { describe, expect, it } from "vitest";
import { addBusinessDays } from "@domain/calendar/business-calendar";
import { holidaySet } from "@domain/calendar/holidays";
import { parseLocalDate } from "@domain/calendar/local-date";
import { earliestDate } from "@domain/delivery/earliest-date";
import { DEFAULT_SETTINGS_V1 } from "@domain/delivery/settings";

const calendar = {
  holidays: holidaySet([]),
  closedWeekdays: [0] as const,
  newYearPreset: true,
};

describe("addBusinessDays", () => {
  it("lead 0 on a closed Sunday returns the next open day", () => {
    const sunday = parseLocalDate("2026-10-18");
    expect(addBusinessDays(calendar, sunday, 0)).toBe("2026-10-19");
  });

  it("lead 0 on an open weekday stays on that day", () => {
    const monday = parseLocalDate("2026-10-19");
    expect(addBusinessDays(calendar, monday, 0)).toBe("2026-10-19");
  });
});

describe("earliestDate", () => {
  it("never returns a closed New Year day as earliest", () => {
    const result = earliestDate({
      now: {
        epochMs: Date.parse("2026-12-28T01:00:00Z"),
        timeZone: "Asia/Tokyo",
      },
      settings: DEFAULT_SETTINGS_V1,
      items: [],
    });
    expect(result.earliest).toBe("2027-01-04");
    expect(result.selectable[0]).toBe(result.earliest);
  });
});
