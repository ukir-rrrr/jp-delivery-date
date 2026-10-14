import { describe, expect, it } from "vitest";
import { addCalendarDays, parseLocalDate, type LocalDate } from "@domain/calendar/local-date";
import {
  addBusinessDays,
  isClosedShipDay,
} from "@domain/calendar/business-calendar";
import { holidaySet } from "@domain/calendar/holidays";
import {
  earliestDate,
  type CartItem,
  type EarliestDateResult,
  type ZonedInstant,
} from "@domain/delivery/earliest-date";
import { DEFAULT_SETTINGS_V1, type SettingsV1 } from "@domain/delivery/settings";

const day = (iso: string): LocalDate => parseLocalDate(iso);

function at(local: string): ZonedInstant {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return { epochMs: Date.parse(`${withSeconds}+09:00`), timeZone: "Asia/Tokyo" };
}

function settings(overrides: Partial<SettingsV1> = {}): SettingsV1 {
  return {
    ...DEFAULT_SETTINGS_V1,
    newYearPreset: false,
    holidays: [],
    closedWeekdays: [0],
    cutoff: "15:00",
    defaultRegionDays: 0,
    prefectureLeadDays: {},
    selectableWindowDays: 30,
    ...overrides,
  };
}

function compute(input: {
  now: ZonedInstant;
  settings?: SettingsV1;
  items?: CartItem[];
  prefecture?: string;
}): EarliestDateResult {
  return earliestDate({
    now: input.now,
    settings: input.settings ?? settings(),
    items: input.items ?? [],
    prefecture: input.prefecture,
  });
}

describe("addBusinessDays", () => {
  const calendar = {
    holidays: holidaySet([]),
    closedWeekdays: [0] as const,
    newYearPreset: true,
  };

  it("lead 0 on a closed Sunday returns the next open day", () => {
    expect(addBusinessDays(calendar, day("2026-10-18"), 0)).toBe("2026-10-19");
  });

  it("lead 0 on an open weekday stays on that day", () => {
    expect(addBusinessDays(calendar, day("2026-10-19"), 0)).toBe("2026-10-19");
  });
});

describe("earliestDate", () => {
  const rows: {
    name: string;
    now: ZonedInstant;
    settings?: SettingsV1;
    items?: CartItem[];
    prefecture?: string;
    earliest: string | null;
    reasons: string[];
  }[] = [
    {
      name: "one minute before the cutoff ships today",
      now: at("2026-10-14T14:59"),
      earliest: "2026-10-14",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "the cutoff minute itself starts tomorrow",
      now: at("2026-10-14T15:00"),
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "seconds past the cutoff still count as that minute",
      now: at("2026-10-14T15:00:30"),
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "one minute after the cutoff starts tomorrow",
      now: at("2026-10-14T15:01"),
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "23:59 JST is still after a 15:00 cutoff",
      now: at("2026-10-14T23:59"),
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "midnight JST is a new day before the cutoff",
      now: at("2026-10-15T00:00"),
      earliest: "2026-10-15",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "a 00:00 cutoff is already past at midnight",
      now: at("2026-10-14T00:00"),
      settings: settings({ cutoff: "00:00" }),
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "23:58 is before a 23:59 cutoff",
      now: at("2026-10-14T23:58"),
      settings: settings({ cutoff: "23:59" }),
      earliest: "2026-10-14",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "23:59 matches a 23:59 cutoff and starts tomorrow",
      now: at("2026-10-14T23:59"),
      settings: settings({ cutoff: "23:59" }),
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "JST evening is not the UTC afternoon",
      now: { epochMs: Date.parse("2026-10-14T14:30:00Z"), timeZone: "Asia/Tokyo" },
      earliest: "2026-10-15",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "Sunday before the cutoff moves to Monday",
      now: at("2026-10-18T10:00"),
      earliest: "2026-10-19",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "Sunday after the cutoff still ships Monday",
      now: at("2026-10-18T16:00"),
      earliest: "2026-10-19",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "Saturday and Sunday closed, Friday after cutoff ships Monday",
      now: at("2026-10-16T15:00"),
      settings: settings({ closedWeekdays: [0, 6] }),
      earliest: "2026-10-19",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "empty cart is lead time 0",
      now: at("2026-10-14T10:00"),
      items: [],
      earliest: "2026-10-14",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "lead time uses the slowest product",
      now: at("2026-10-14T10:00"),
      items: [
        { productId: "fast", leadTimeDays: 1 },
        { productId: "slow", leadTimeDays: 4 },
      ],
      earliest: "2026-10-19",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "Friday after cutoff, lead 1, Monday holiday ships Tuesday",
      now: at("2026-10-16T16:00"),
      settings: settings({ holidays: [day("2026-10-19")] }),
      items: [{ productId: "1", leadTimeDays: 1 }],
      earliest: "2026-10-20",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "Golden Week chain skips the holiday run",
      now: at("2026-04-29T10:00"),
      settings: settings({
        defaultRegionDays: 2,
        holidays: [
          day("2026-04-29"),
          day("2026-05-03"),
          day("2026-05-04"),
          day("2026-05-05"),
          day("2026-05-06"),
        ],
      }),
      items: [{ productId: "1", leadTimeDays: 2 }],
      prefecture: "13",
      earliest: "2026-05-07",
      reasons: ["before_cutoff", "lead_time", "region_days", "snapped_to_open_day"],
    },
    {
      name: "a substitute holiday on Monday pushes delivery to Tuesday",
      now: at("2026-05-02T10:00"),
      settings: settings({
        holidays: [day("2026-05-03"), day("2026-05-04")],
        defaultRegionDays: 1,
      }),
      earliest: "2026-05-05",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture", "snapped_to_open_day"],
    },
    {
      name: "without the substitute holiday, Monday is open",
      now: at("2026-05-02T10:00"),
      settings: settings({
        holidays: [day("2026-05-03")],
        defaultRegionDays: 1,
      }),
      earliest: "2026-05-04",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture", "snapped_to_open_day"],
    },
    {
      name: "leap day is a normal shipping day",
      now: at("2024-02-28T10:00"),
      items: [{ productId: "1", leadTimeDays: 1 }],
      earliest: "2024-02-29",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "a holiday on leap day moves shipping to March 1",
      now: at("2024-02-28T10:00"),
      settings: settings({ holidays: [day("2024-02-29")] }),
      items: [{ productId: "1", leadTimeDays: 1 }],
      earliest: "2024-03-01",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "New Year preset before the cutoff snaps across the year boundary",
      now: { epochMs: Date.parse("2026-12-28T01:00:00Z"), timeZone: "Asia/Tokyo" },
      settings: DEFAULT_SETTINGS_V1,
      earliest: "2027-01-04",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture", "snapped_to_open_day"],
    },
    {
      name: "New Year after the cutoff adds region days from January 4",
      now: at("2026-12-28T16:00"),
      settings: DEFAULT_SETTINGS_V1,
      earliest: "2027-01-06",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "New Year preset off keeps the calendar-day arrival",
      now: { epochMs: Date.parse("2026-12-28T01:00:00Z"), timeZone: "Asia/Tokyo" },
      settings: { ...DEFAULT_SETTINGS_V1, newYearPreset: false },
      earliest: "2026-12-30",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "December 31 after the cutoff waits until January 4",
      now: at("2026-12-31T16:00"),
      settings: settings({ newYearPreset: true }),
      earliest: "2027-01-04",
      reasons: ["past_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "January 3 is still inside the New Year preset",
      now: at("2027-01-03T10:00"),
      settings: settings({ newYearPreset: true, defaultRegionDays: 2 }),
      earliest: "2027-01-06",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "January 4 is the first open day after the preset",
      now: at("2027-01-04T10:00"),
      settings: settings({ newYearPreset: true }),
      earliest: "2027-01-04",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "Tokyo uses its own region days",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 2,
        prefectureLeadDays: { "13": 1, "47": 5 },
      }),
      prefecture: "13",
      earliest: "2026-10-15",
      reasons: ["before_cutoff", "lead_time", "region_days"],
    },
    {
      name: "Okinawa uses the remote offset",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 2,
        prefectureLeadDays: { "13": 1, "47": 5 },
      }),
      prefecture: "47",
      earliest: "2026-10-19",
      reasons: ["before_cutoff", "lead_time", "region_days"],
    },
    {
      name: "an unknown prefecture uses the slowest region, not the default",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 1,
        prefectureLeadDays: { "13": 1, "47": 5 },
      }),
      earliest: "2026-10-19",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "a blank prefecture is unknown",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 1,
        prefectureLeadDays: { "47": 5 },
      }),
      prefecture: "",
      earliest: "2026-10-19",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "a known prefecture missing from the map uses the default, not the slowest",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 2,
        prefectureLeadDays: { "47": 5 },
      }),
      prefecture: "01",
      earliest: "2026-10-16",
      reasons: ["before_cutoff", "lead_time", "region_days"],
    },
    {
      name: "an explicit zero region offset stays on the ship day",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 4,
        prefectureLeadDays: { "13": 0 },
      }),
      prefecture: "13",
      earliest: "2026-10-14",
      reasons: ["before_cutoff", "lead_time", "region_days"],
    },
    {
      name: "the default wins when it is slower than every prefecture",
      now: at("2026-10-14T10:00"),
      settings: settings({
        defaultRegionDays: 9,
        prefectureLeadDays: { "13": 1 },
      }),
      earliest: "2026-10-23",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "region days that land on Sunday move to Monday",
      now: at("2026-10-14T10:00"),
      settings: settings({ prefectureLeadDays: { "13": 4 } }),
      prefecture: "13",
      earliest: "2026-10-19",
      reasons: ["before_cutoff", "lead_time", "region_days", "snapped_to_open_day"],
    },
    {
      name: "a ten-day holiday chain lands on the next open Thursday",
      now: at("2026-10-19T10:00"),
      settings: settings({
        holidays: Array.from({ length: 10 }, (_, index) =>
          addCalendarDays(day("2026-10-19"), index),
        ),
      }),
      earliest: "2026-10-29",
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
    {
      name: "every weekday closed returns no date and does not loop",
      now: at("2026-10-14T10:00"),
      settings: settings({ closedWeekdays: [0, 1, 2, 3, 4, 5, 6] }),
      earliest: null,
      reasons: ["before_cutoff", "lead_time", "all_closed_horizon"],
    },
    {
      name: "a long lead still reaches the only open weekday",
      now: at("2026-10-14T10:00"),
      settings: settings({ closedWeekdays: [0, 2, 3, 4, 5, 6] }),
      items: [{ productId: "1", leadTimeDays: 60 }],
      earliest: addCalendarDays(day("2026-10-19"), 60 * 7),
      reasons: ["before_cutoff", "lead_time", "unknown_prefecture"],
    },
  ];

  it.each(rows)("$name", (row) => {
    const result = compute(row);
    expect(result.earliest).toBe(row.earliest);
    expect(result.reasons.map((reason) => reason.code)).toEqual(row.reasons);
    if (result.earliest) {
      expect(result.selectable[0]).toBe(result.earliest);
      expect(result.earliest >= "2026-01-01" || result.earliest >= "2024-01-01").toBe(true);
    } else {
      expect(result.selectable).toEqual([]);
    }
  });

  it("describes the cutoff boundary in the trace", () => {
    const before = compute({ now: at("2026-10-14T14:59") });
    const atCutoff = compute({ now: at("2026-10-14T15:00") });
    expect(before.reasons[0]?.detail).toBe("14:59 < 15:00");
    expect(atCutoff.reasons[0]?.detail).toBe("15:00 >= 15:00");
  });

  it("skips Sundays inside the selectable window", () => {
    const result = compute({
      now: at("2026-10-14T10:00"),
      settings: settings({ selectableWindowDays: 8 }),
    });
    expect(result.selectable).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
    ]);
  });

  it("omits a holiday inside the window and keeps the next open day", () => {
    const result = compute({
      now: at("2026-10-14T10:00"),
      settings: settings({
        holidays: [day("2026-10-15")],
        selectableWindowDays: 3,
      }),
    });
    expect(result.selectable).toEqual(["2026-10-14", "2026-10-16"]);
  });

  it("keeps New Year days out of the window", () => {
    const result = compute({
      now: at("2026-12-28T10:00"),
      settings: settings({ newYearPreset: true, selectableWindowDays: 10 }),
    });
    expect(result.selectable).toEqual([
      "2026-12-28",
      "2027-01-04",
      "2027-01-05",
      "2027-01-06",
    ]);
  });

  it("rejects inputs that could move the date earlier", () => {
    const badNow = earliestDate({
      now: { epochMs: Date.now(), timeZone: "UTC" as "Asia/Tokyo" },
      settings: settings(),
      items: [],
    });
    const badCutoff = compute({
      now: at("2026-10-14T10:00"),
      settings: settings({ cutoff: "3pm" }),
    });
    const badLead = compute({
      now: at("2026-10-14T10:00"),
      items: [{ productId: "1", leadTimeDays: Number.NaN }],
    });
    const negativeRegion = compute({
      now: at("2026-10-14T10:00"),
      settings: settings({ defaultRegionDays: -1 }),
    });
    const badHoliday = compute({
      now: at("2026-10-14T10:00"),
      settings: settings({ holidays: ["2026-02-31" as LocalDate] }),
    });
    for (const result of [badNow, badCutoff, badLead, negativeRegion, badHoliday]) {
      expect(result.earliest).toBeNull();
      expect(result.reasons.map((reason) => reason.code)).toEqual(["invalid_input"]);
    }
  });

  it("never moves earlier as now, lead time, or region days increase", () => {
    const base = settings();
    let previous = "0000-01-01";
    const start = Date.parse("2026-10-12T00:00:00+09:00");
    for (let offset = 0; offset <= 8 * 24 * 60; offset += 30) {
      const result = compute({
        now: { epochMs: start + offset * 60 * 1000, timeZone: "Asia/Tokyo" },
        settings: base,
      });
      expect(result.earliest! >= previous).toBe(true);
      previous = result.earliest!;
    }

    previous = "0000-01-01";
    for (let lead = 0; lead <= 12; lead += 1) {
      const result = compute({
        now: at("2026-10-14T10:00"),
        items: [{ productId: "1", leadTimeDays: lead }],
      });
      expect(result.earliest! >= previous).toBe(true);
      previous = result.earliest!;
    }

    previous = "0000-01-01";
    for (let region = 0; region <= 12; region += 1) {
      const result = compute({
        now: at("2026-10-14T10:00"),
        settings: settings({ prefectureLeadDays: { "13": region } }),
        prefecture: "13",
      });
      expect(result.earliest! >= previous).toBe(true);
      previous = result.earliest!;
    }
  });

  it("adding a holiday never makes the date earlier", () => {
    const now = at("2026-10-14T10:00");
    const base = compute({ now });
    for (const holiday of base.selectable) {
      const next = compute({
        now,
        settings: settings({ holidays: [day(holiday)] }),
      });
      expect(next.earliest! >= base.earliest!).toBe(true);
    }
  });

  it("stays on or after today and off closed days for every day of 2026", () => {
    const calendar = {
      holidays: holidaySet([]),
      closedWeekdays: [0] as const,
      newYearPreset: true,
    };
    const configured = settings({ newYearPreset: true });
    let previous = "0000-01-01";
    for (
      let cursor = day("2026-01-01");
      cursor <= "2026-12-31";
      cursor = addCalendarDays(cursor, 1)
    ) {
      for (const time of ["10:00", "18:00"]) {
        const result = compute({
          now: at(`${cursor}T${time}`),
          settings: configured,
        });
        expect(result.earliest! >= cursor).toBe(true);
        expect(result.earliest! >= previous).toBe(true);
        expect(isClosedShipDay(calendar, result.earliest!)).toBe(false);
        expect(result.selectable[0]).toBe(result.earliest);
        for (const selectable of result.selectable) {
          expect(isClosedShipDay(calendar, selectable)).toBe(false);
        }
        previous = result.earliest!;
      }
    }
  });
});
