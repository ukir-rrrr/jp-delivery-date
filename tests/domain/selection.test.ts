import { describe, expect, it } from "vitest";
import { parseLocalDate } from "@domain/calendar/local-date";
import { readCartItems, resolveLeadTimes } from "@domain/delivery/cart-items";
import { readSettingsV1, DEFAULT_SETTINGS_V1 } from "@domain/delivery/settings";
import {
  buildDeliveryAttributes,
  clearDeliveryAttributes,
  validateSelection,
} from "@domain/delivery/selection";
import { formatDeliveryDateLabel } from "@domain/delivery/labels";
import { parseDeliveryChoice } from "@domain/order/parse-note-attributes";
import { parseSettings } from "@infra/metafields/settings";

const selectable = ["2026-10-15", "2026-10-16"];
const slots = ["morning", "evening"];

describe("validateSelection", () => {
  it("accepts an empty choice when the field is optional", () => {
    expect(
      validateSelection({
        required: false,
        date: "",
        slot: "",
        selectable,
        offeredSlots: slots,
      }).ok,
    ).toBe(true);
  });

  it("requires a date when the merchant marked it required", () => {
    const result = validateSelection({
      required: true,
      date: " ",
      slot: "",
      selectable,
      offeredSlots: slots,
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(["date_required"]);
  });

  it("rejects a date outside the selectable window and a partial choice", () => {
    expect(
      validateSelection({
        required: false,
        date: "2026-10-14",
        slot: "morning",
        selectable,
        offeredSlots: slots,
      }).issues.map((issue) => issue.code),
    ).toEqual(["date_not_selectable"]);

    expect(
      validateSelection({
        required: false,
        date: "2026-10-15",
        slot: "",
        selectable,
        offeredSlots: slots,
      }).issues.map((issue) => issue.code),
    ).toEqual(["slot_required"]);

    expect(
      validateSelection({
        required: false,
        date: "",
        slot: "morning",
        selectable,
        offeredSlots: slots,
      }).issues.map((issue) => issue.code),
    ).toEqual(["date_required"]);
  });

  it("accepts a date and an offered slot", () => {
    expect(
      validateSelection({
        required: true,
        date: "2026-10-15",
        slot: "morning",
        selectable,
        offeredSlots: slots,
      }).ok,
    ).toBe(true);
  });
});

describe("delivery attributes", () => {
  it("writes the visible labels and the machine keys", () => {
    expect(buildDeliveryAttributes(parseLocalDate("2026-10-15"), "morning")).toEqual({
      配達希望日: "2026/10/15",
      配達時間帯: "午前中",
      _delivery_date: "2026-10-15",
      _delivery_slot: "morning",
      _delivery_v: "1",
    });
  });

  it("clears every key", () => {
    expect(Object.values(clearDeliveryAttributes())).toEqual(["", "", "", "", ""]);
  });
});

describe("parseDeliveryChoice", () => {
  it("prefers machine keys and also reads slash dates and slot labels", () => {
    expect(
      parseDeliveryChoice([
        { key: "_delivery_date", value: "2026-10-15" },
        { key: "_delivery_slot", value: "morning" },
      ]),
    ).toMatchObject({ date: "2026-10-15", slot: "morning", missing: false });

    expect(
      parseDeliveryChoice([
        { key: "配達希望日", value: "2026/10/16" },
        { key: "配達時間帯", value: "午前中" },
      ]),
    ).toMatchObject({ date: "2026-10-16", slot: "morning", missing: false });

    expect(
      parseDeliveryChoice([{ key: "配達時間帯", value: "Morning" }]),
    ).toMatchObject({ date: null, slot: "morning", missing: false });

    expect(parseDeliveryChoice([])).toMatchObject({
      date: null,
      slot: "unspecified",
      missing: true,
    });
  });
});

describe("readSettingsV1", () => {
  it("agrees with the server codec on the default settings", () => {
    expect(readSettingsV1(DEFAULT_SETTINGS_V1)).toEqual(parseSettings(DEFAULT_SETTINGS_V1));
  });

  it("fails closed on a partial or negative payload", () => {
    expect(readSettingsV1(null)).toBeNull();
    expect(readSettingsV1({ schemaVersion: 1 })).toBeNull();
    expect(readSettingsV1({ ...DEFAULT_SETTINGS_V1, defaultRegionDays: -1 })).toBeNull();
    expect(() => parseSettings({ ...DEFAULT_SETTINGS_V1, defaultRegionDays: -1 })).toThrow();
  });
});

describe("lead times", () => {
  it("reads Liquid's numeric ids and refuses an unknown product", () => {
    const known = readCartItems([
      { productId: 10, leadTimeDays: "2" },
      { productId: "10", leadTimeDays: 4 },
    ]);
    expect(known).toEqual([
      { productId: "10", leadTimeDays: 2 },
      { productId: "10", leadTimeDays: 4 },
    ]);
    expect(resolveLeadTimes(["10"], known!)).toEqual([
      { productId: "10", leadTimeDays: 4 },
    ]);
    expect(resolveLeadTimes(["11"], known!)).toBeNull();
    expect(readCartItems([{ productId: "1", leadTimeDays: -1 }])).toBeNull();
  });
});

describe("formatDeliveryDateLabel", () => {
  it("formats Japanese and English labels", () => {
    const date = parseLocalDate("2026-10-14");
    expect(formatDeliveryDateLabel(date, "ja")).toBe("2026年10月14日（水）");
    expect(formatDeliveryDateLabel(date, "en")).toBe("Wed, 2026-10-14");
  });
});
