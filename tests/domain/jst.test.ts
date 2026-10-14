import { describe, expect, it } from "vitest";
import { jstDateTime } from "@domain/calendar/jst";

describe("jstDateTime", () => {
  it("reads the JST civil date, not the host zone", () => {
    const evening = jstDateTime(Date.parse("2026-10-14T14:30:00Z"));
    expect(evening.date).toBe("2026-10-14");
    expect(evening.minutes).toBe(23 * 60 + 30);
  });

  it("truncates seconds and rolls midnight to the next JST date", () => {
    const midnight = jstDateTime(Date.parse("2026-10-15T00:00:30+09:00"));
    expect(midnight.date).toBe("2026-10-15");
    expect(midnight.minutes).toBe(0);
  });

  it("crosses the year boundary in JST", () => {
    const newYear = jstDateTime(Date.parse("2026-12-31T15:00:00Z"));
    expect(newYear.date).toBe("2027-01-01");
    expect(newYear.minutes).toBe(0);
  });
});
