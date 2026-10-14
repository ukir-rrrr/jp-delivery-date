import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import iconv from "iconv-lite";
import { DEFAULT_SETTINGS_V1 } from "@domain/delivery/settings";

const adminMock = vi.hoisted(() => vi.fn());
const exportedMock = vi.hoisted(() => vi.fn());
const recordMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/shopify.server", () => ({
  authenticate: { admin: adminMock },
}));

vi.mock("../../app/export-log.server", () => ({
  exportedOrderIds: exportedMock,
  recordExportedOrders: recordMock,
}));

import { loader as ordersLoader } from "../../app/routes/app.orders";
import { action as exportAction, loader as exportLoader } from "../../app/routes/app.export.$carrier";

const NOW = Date.parse("2026-10-14T00:00:00.000Z");

const storedSettings = {
  ...DEFAULT_SETTINGS_V1,
  sender: {
    name: "山田商店",
    postalCode: "1000001",
    prefecture: "東京都",
    address1: "千代田区丸の内1-1",
    address2: "",
    phone: "03-1234-5678",
    yamatoBillingCode: "123456789012",
    yamatoFreightNumber: "01",
  },
};

beforeEach(() => {
  adminMock.mockReset();
  exportedMock.mockReset();
  recordMock.mockReset();
  exportedMock.mockResolvedValue(new Set());
  recordMock.mockResolvedValue(undefined);
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

describe("orders loader", () => {
  it("filters Buy Now orders with the missing-date flag and does not store buyer details", async () => {
    const calls = install(() => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [datedNode(), buyNowNode()],
        },
      },
    }));

    const result = await ordersLoader(args("/app/orders?missing=1"));
    expect(result).toMatchObject({ ok: true, pcdRedacted: false });
    if (!result.ok) return;
    expect(result.rows.map((row) => row.orderName)).toEqual(["#1002"]);
    expect(result.rows[0]?.issues.some((issue) => issue.code === "missing_delivery_date")).toBe(true);
    expect(result.rows[0]?.defaultSelected).toBe(false);
    expect(result.carrier).toMatchObject({ id: "yamato" });
    expect(calls.some((call) => call.query.includes("email"))).toBe(false);
    expect(exportedMock).toHaveBeenCalledWith(
      "demo.myshopify.com",
      "yamato",
      ["gid://shopify/Order/1001", "gid://shopify/Order/1002"],
    );
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("shows a PCD banner when shipping fields come back null", async () => {
    install(() => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [redactedNode()],
        },
      },
    }));
    const result = await ordersLoader(args("/app/orders"));
    expect(result).toMatchObject({ ok: true, pcdRedacted: true });
    if (!result.ok) return;
    expect(result.rows[0]?.preview.every((line) => line.value === "" || line.label === "出荷予定日" || line.label === "お客様管理番号")).toBe(true);
  });
});

describe("orders carrier", () => {
  it("reviews the page with the selected carrier and logs that carrier only", async () => {
    install(() => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
        orders: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [datedNode()],
        },
      },
    }));
    const sagawa = await ordersLoader(args("/app/orders?carrier=sagawa"));
    expect(sagawa).toMatchObject({ ok: true, carrier: { id: "sagawa" }, carrierError: null });
    if (!sagawa.ok) return;
    expect(sagawa.rows[0]?.preview).toContainEqual({ label: "配達日", value: "20261020" });
    expect(sagawa.rows[0]?.preview).toContainEqual({ label: "配達指定時間帯", value: "01" });
    expect(sagawa.rows[0]?.issues).toEqual([]);
    expect(exportedMock).toHaveBeenCalledWith("demo.myshopify.com", "sagawa", ["gid://shopify/Order/1001"]);

    const yupack = await ordersLoader(args("/app/orders?carrier=yupackR"));
    if (!yupack.ok) return;
    expect(yupack.rows[0]?.preview).toContainEqual({ label: "配達希望日", value: "20261020" });
    expect(yupack.rows[0]?.preview).toContainEqual({ label: "配達時間帯区分", value: "51" });
  });
});

describe("yamato export", () => {
  it("fetches buyer details at export time, applies the date edit, and logs ids only", async () => {
    install((_query, variables) => {
      const ids = (variables?.ids as string[] | undefined) ?? [];
      return {
        data: {
          currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
          nodes: ids.map((id) => ({ __typename: "Order", ...buyNowNode(), id })),
        },
      };
    });

    const form = new FormData();
    form.set("orderId", "gid://shopify/Order/1002");
    form.set("date:1002", "2026-10-20");
    form.set("slot:1002", "morning");
    const response = await exportAction(actionArgs(form));
    expect(response.status).toBe(200);
    const text = iconv.decode(Buffer.from(await response.arrayBuffer()), "shiftjis");
    expect(text).toContain("2026/10/20");
    expect(text).toContain("0812");
    expect(text).toContain("佐藤花");
    expect(recordMock).toHaveBeenCalledTimes(1);
    expect(recordMock.mock.calls[0]).toEqual([
      "demo.myshopify.com",
      "yamato",
      ["gid://shopify/Order/1002"],
    ]);
  });

  it("does not log or encode a row that still has no delivery date", async () => {
    install((_query, variables) => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
        nodes: ((variables?.ids as string[] | undefined) ?? []).map((id) => ({
          __typename: "Order",
          ...buyNowNode(),
          id,
        })),
      },
    }));
    const form = new FormData();
    form.set("orderId", "gid://shopify/Order/1002");
    form.set("date:1002", "");
    form.set("slot:1002", "unspecified");
    const response = await exportAction(actionArgs(form));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.failures[0].issues.some((issue: { code: string }) => issue.code === "missing_delivery_date")).toBe(true);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("refuses a redacted order instead of writing a blank label", async () => {
    install((_query, variables) => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
        nodes: ((variables?.ids as string[] | undefined) ?? []).map((id) => ({
          __typename: "Order",
          ...redactedNode(),
          id,
        })),
      },
    }));
    const form = new FormData();
    form.set("orderId", "gid://shopify/Order/1003");
    form.set("date:1003", "2026-10-20");
    form.set("slot:1003", "morning");
    const response = await exportAction(actionArgs(form));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("渋谷");
    expect(body.failures[0].issues.some((issue: { code: string }) => issue.code === "pcd_redacted")).toBe(true);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("does not export through GET", async () => {
    adminMock.mockResolvedValue({ admin: { graphql: vi.fn() }, session: { shop: "demo.myshopify.com" } });
    const yamato = await exportLoader(loaderArgs("/app/export/yamato", { carrier: "yamato" }));
    expect(yamato.status).toBe(405);
    const sagawa = await exportLoader(loaderArgs("/app/export/sagawa", { carrier: "sagawa" }));
    expect(sagawa.status).toBe(405);
    const yupack = await exportLoader(loaderArgs("/app/export/yupackR", { carrier: "yupackR" }));
    expect(yupack.status).toBe(405);
    const unknown = await exportLoader(loaderArgs("/app/export/other", { carrier: "other" }));
    expect(unknown.status).toBe(501);
  });

  it("writes a Sagawa file from the in-memory date edit", async () => {
    install((_query, variables) => {
      const ids = (variables?.ids as string[] | undefined) ?? [];
      return {
        data: {
          currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
          nodes: ids.map((id) => ({ __typename: "Order", ...buyNowNode(), id })),
        },
      };
    });
    const form = new FormData();
    form.set("orderId", "gid://shopify/Order/1002");
    form.set("date:1002", "2026-10-20");
    form.set("slot:1002", "morning");
    const response = await exportAction(actionArgs(form, "sagawa"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("sagawa-ehiden3.csv");
    const text = iconv.decode(Buffer.from(await response.arrayBuffer()), "shiftjis");
    expect(text).toContain("20261020");
    expect(text).toContain("佐藤花");
    expect(text).not.toContain("2026/10/20");
    expect(recordMock.mock.calls[0]?.[1]).toBe("sagawa");
  });

  it("writes a Yu-Print R file with the official morning code", async () => {
    install((_query, variables) => {
      const ids = (variables?.ids as string[] | undefined) ?? [];
      return {
        data: {
          currentAppInstallation: { metafield: { value: JSON.stringify(storedSettings) } },
          nodes: ids.map((id) => ({ __typename: "Order", ...buyNowNode(), id })),
        },
      };
    });
    const form = new FormData();
    form.set("orderId", "gid://shopify/Order/1002");
    form.set("date:1002", "2026-10-20");
    form.set("slot:1002", "morning");
    const response = await exportAction(actionArgs(form, "yupackR"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("yupack-r.csv");
    const text = iconv.decode(Buffer.from(await response.arrayBuffer()), "shiftjis");
    expect(text).toContain("20261020");
    expect(text).toContain(",51,");
    expect(recordMock.mock.calls[0]?.[1]).toBe("yupackR");
  });
});

describe("export log module", () => {
  it("selects order ids and nothing else", () => {
    const src = readFileSync("app/export-log.server.ts", "utf8");
    expect(src).toMatch(/select:\s*\{\s*orderId:\s*true\s*\}/);
    expect(src).not.toMatch(/shipping|firstName|lastName|email/);
  });
});

function install(
  handler: (query: string, variables?: Record<string, unknown>) => unknown,
) {
  const calls: { query: string; variables?: Record<string, unknown> }[] = [];
  adminMock.mockImplementation(async () => ({
    session: { shop: "demo.myshopify.com" },
    admin: {
      graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
        calls.push({ query, variables: options?.variables });
        const result = handler(query, options?.variables);
        return result instanceof Response ? result : Response.json(result);
      },
    },
  }));
  return calls;
}

function datedNode() {
  return node("1001", "#1001", "山田太郎", [
    { key: "_delivery_date", value: "2026-10-20" },
    { key: "_delivery_slot", value: "morning" },
  ]);
}

function buyNowNode() {
  return node("1002", "#1002", "佐藤花", []);
}

function redactedNode() {
  return {
    ...node("1003", "#1003", "", []),
    phone: null,
    shippingAddress: {
      name: null,
      phone: null,
      zip: null,
      province: null,
      city: null,
      address1: null,
      address2: null,
    },
  };
}

function node(id: string, name: string, recipient: string, customAttributes: { key: string; value: string }[]) {
  return {
    id: `gid://shopify/Order/${id}`,
    name,
    displayFulfillmentStatus: "UNFULFILLED",
    phone: "090-1111-2222",
    customAttributes,
    shippingAddress: {
      name: recipient,
      phone: "090-1111-2222",
      zip: "1500001",
      province: "東京都",
      city: "渋谷区",
      address1: "神宮前1-2-3",
      address2: "",
    },
    lineItems: { pageInfo: { hasNextPage: false }, nodes: [{ title: "茶" }] },
  };
}

function args(pathname: string): LoaderFunctionArgs {
  return loaderArgs(pathname, {});
}

function loaderArgs(pathname: string, params: Record<string, string>): LoaderFunctionArgs {
  const request = new Request(`https://example.com${pathname}`);
  return { request, params, context: {}, pattern: pathname } as LoaderFunctionArgs;
}

function actionArgs(form: FormData, carrier = "yamato"): ActionFunctionArgs {
  const request = new Request(`https://example.com/app/export/${carrier}`, { method: "POST", body: form });
  return {
    request,
    params: { carrier },
    context: {},
    pattern: "/app/export/:carrier",
  } as unknown as ActionFunctionArgs;
}
