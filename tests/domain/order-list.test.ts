import { describe, expect, it } from "vitest";
import { parseLocalDate } from "@domain/calendar/local-date";
import { applyDeliveryEdit } from "@domain/order/apply-edit";
import { orderMatchesFilter } from "@domain/order/list-filter";
import { normalizeDeliveryOrder } from "@domain/order/normalize-order";
import { emptyNormalizedOrder } from "@domain/order/parse-note-attributes";

const shipDate = parseLocalDate("2026-10-14");

describe("order list filters", () => {
  it("treats a Buy Now order as missing a delivery date", () => {
    const order = normalizeDeliveryOrder({
      orderId: "gid://shopify/Order/1",
      orderName: "#1",
      contactPhone: "090-0000-0000",
      shipping: {
        name: "山田太郎",
        phone: "090-0000-0000",
        postalCode: "1500001",
        province: "東京都",
        city: "渋谷区",
        address1: "1-2-3",
        address2: null,
      },
      attributes: [],
      lineItems: ["茶"],
      lineItemsTruncated: false,
      shipDate,
    });
    expect(order.missingDeliveryPreference).toBe(true);
    expect(order.deliveryDate).toBeNull();
    const row = { order, exported: false, hasIssues: true };
    expect(orderMatchesFilter(row, { status: "all", deliveryDate: null, missingDate: true })).toBe(true);
    expect(orderMatchesFilter(row, { status: "needs_review", deliveryDate: null, missingDate: false })).toBe(true);
    expect(orderMatchesFilter(row, { status: "all", deliveryDate: parseLocalDate("2026-10-20"), missingDate: false })).toBe(false);
  });

  it("filters exported orders without looking at buyer details", () => {
    const order = emptyNormalizedOrder("gid://shopify/Order/2", {
      deliveryDate: parseLocalDate("2026-10-20"),
      missingDeliveryPreference: false,
    });
    const row = { order, exported: true, hasIssues: false };
    expect(orderMatchesFilter(row, { status: "exported", deliveryDate: null, missingDate: false })).toBe(true);
    expect(orderMatchesFilter(row, { status: "unexported", deliveryDate: null, missingDate: false })).toBe(false);
  });

  it("applies a date and slot edit in memory", () => {
    const order = emptyNormalizedOrder("gid://shopify/Order/3", { orderName: "#3" });
    const edited = applyDeliveryEdit(order, { date: "2026-10-20", slot: "morning" });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.order.deliveryDate).toBe("2026-10-20");
    expect(edited.order.slot).toBe("morning");
    expect(edited.order.missingDeliveryPreference).toBe(false);
    expect(order.deliveryDate).toBeNull();
  });

  it("marks an all-null shipping address as redacted", () => {
    const order = normalizeDeliveryOrder({
      orderId: "gid://shopify/Order/4",
      orderName: "#4",
      contactPhone: null,
      shipping: {
        name: null,
        phone: null,
        postalCode: null,
        province: null,
        city: null,
        address1: null,
        address2: null,
      },
      attributes: [],
      lineItems: [],
      lineItemsTruncated: false,
      shipDate,
    });
    expect(order.pcdRedacted).toBe(true);
    expect(order.name).toBe("");
  });
});
