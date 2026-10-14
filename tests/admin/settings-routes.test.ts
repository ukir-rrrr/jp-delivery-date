import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoaderFunctionArgs } from "react-router";
import { earliestDate } from "@domain/delivery/earliest-date";
import { DEFAULT_SETTINGS_V1 } from "@domain/delivery/settings";
import {
  LEAD_TIME_METAFIELD_KEY,
  LEAD_TIME_METAFIELD_NAMESPACE,
  SETTINGS_METAFIELD_KEY,
  SETTINGS_METAFIELD_NAMESPACE,
} from "@infra/graphql/admin";
import { migrate } from "@infra/metafields/settings";

const adminMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/shopify.server", () => ({
  authenticate: {
    admin: adminMock,
  },
}));

import { loader as homeLoader } from "../../app/routes/app._index";
import {
  action as settingsAction,
  loader as settingsLoader,
  shouldRevalidate as settingsShouldRevalidate,
} from "../../app/routes/app.settings._index";
import {
  action as productsAction,
  loader as productsLoader,
  shouldRevalidate as productsShouldRevalidate,
} from "../../app/routes/app.settings.products";

const NOW = Date.parse("2026-10-14T00:00:00.000Z");

beforeEach(() => {
  adminMock.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

describe("settings loader", () => {
  it("returns defaults and a preview when the metafield is missing", async () => {
    const calls = install((query) => {
      expect(query).toContain("DeliverySettings");
      return {
        data: { currentAppInstallation: { metafield: null } },
      };
    });

    const result = await settingsLoader(args("/app/settings"));
    expect(calls[0]?.variables).toEqual({
      namespace: SETTINGS_METAFIELD_NAMESPACE,
      key: SETTINGS_METAFIELD_KEY,
    });
    expect(result).toMatchObject({ ok: true, status: "missing", settings: DEFAULT_SETTINGS_V1 });
    if (!result.ok) throw new Error("expected settings");
    expect(result.preview).toEqual(
      earliestDate({
        now: { epochMs: NOW, timeZone: "Asia/Tokyo" },
        settings: DEFAULT_SETTINGS_V1,
        items: [],
      }),
    );
  });

  it("reads a saved settings document through the codec", async () => {
    const stored = {
      ...DEFAULT_SETTINGS_V1,
      cutoff: "12:00",
      holidays: ["2026-01-01"],
      sender: { name: "店舗" },
    };
    install(() => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(stored) } },
      },
    }));

    const result = await settingsLoader(args("/app/settings"));
    expect(result).toMatchObject({ ok: true, status: "ok", settings: migrate(stored) });
  });

  it("keeps the page usable when the stored document is not settings v1", async () => {
    install(() => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify({ schemaVersion: 2 }) } },
      },
    }));
    const invalid = await settingsLoader(args("/app/settings"));
    expect(invalid).toMatchObject({
      ok: true,
      status: "invalid",
      settings: DEFAULT_SETTINGS_V1,
    });

    install(() => ({
      data: { currentAppInstallation: { metafield: { value: "null" } } },
    }));
    const empty = await settingsLoader(args("/app/settings"));
    expect(empty).toMatchObject({ ok: true, status: "invalid" });
  });

  it("does not throw when Shopify is unavailable", async () => {
    install(() => new Response("no", { status: 503 }));
    const result = await settingsLoader(args("/app/settings"));
    expect(result).toMatchObject({ ok: false });
  });
});

describe("settings action", () => {
  it("writes one validated json metafield on the app installation", async () => {
    const calls = install(saveHandler);

    const result = await settingsAction(
      args("/app/settings", {
        method: "POST",
        body: settingsForm({
          holidays: "2026-05-05\n2026-01-01\n2026-05-05",
          prefectureDays: { "01": "4", "13": "0" },
          senderName: "店舗",
        }),
      }),
    );

    expect(result).toEqual({ ok: true });
    const mutation = calls.find((call) => call.query.includes("SetAppMetafields"));
    const metafields = mutation?.variables?.metafields as {
      ownerId: string;
      namespace: string;
      key: string;
      type: string;
      value: string;
    }[];
    expect(metafields).toHaveLength(1);
    expect(metafields[0]).toMatchObject({
      ownerId: "gid://shopify/AppInstallation/9",
      namespace: SETTINGS_METAFIELD_NAMESPACE,
      key: SETTINGS_METAFIELD_KEY,
      type: "json",
    });
    expect(migrate(JSON.parse(metafields[0]?.value ?? ""))).toMatchObject({
      schemaVersion: 1,
      holidays: ["2026-01-01", "2026-05-05"],
      newYearPreset: true,
      closedWeekdays: [0],
      cutoff: "15:00",
      prefectureLeadDays: { "01": 4, "13": 0 },
      sender: { name: "店舗" },
    });
    expect(calls.some((call) => call.query.includes("shop {"))).toBe(false);
  });

  it("rejects an invalid cutoff before calling Shopify", async () => {
    const calls = install(saveHandler);
    const result = await settingsAction(
      args("/app/settings", { method: "POST", body: settingsForm({ cutoff: "99:99" }) }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { cutoff: expect.stringContaining("HH:mm") },
    });
    expect(calls).toHaveLength(0);
  });

  it("requires a slot and treats a missing new-year checkbox as off", async () => {
    const rejected = install(saveHandler);
    const withoutSlots = await settingsAction(
      args("/app/settings", { method: "POST", body: settingsForm({ slots: [] }) }),
    );
    expect(rejected).toHaveLength(0);
    expect(withoutSlots).toMatchObject({
      ok: false,
      fieldErrors: { slots: expect.stringContaining("1つ以上") },
    });

    const calls = install(saveHandler);
    const result = await settingsAction(
      args("/app/settings", {
        method: "POST",
        body: settingsForm({ newYearPreset: false }),
      }),
    );
    expect(result).toEqual({ ok: true });
    const saved = savedSettings(calls);
    expect(saved.newYearPreset).toBe(false);
  });

  it("returns Shopify userErrors and hides transport failures", async () => {
    install((query) => {
      if (query.includes("CurrentAppInstallationId")) {
        return { data: { currentAppInstallation: { id: "gid://shopify/AppInstallation/9" } } };
      }
      return {
        data: { metafieldsSet: { metafields: [], userErrors: [{ message: "値を保存できません" }] } },
      };
    });
    const userError = await settingsAction(
      args("/app/settings", { method: "POST", body: settingsForm() }),
    );
    expect(userError).toMatchObject({ ok: false, formError: "値を保存できません" });

    install(() => ({ errors: [{ message: "throttled" }] }));
    const transport = await settingsAction(
      args("/app/settings", { method: "POST", body: settingsForm() }),
    );
    expect(transport).toMatchObject({ ok: false });
    expect(JSON.stringify(transport)).not.toContain("throttled");

    const thrown = Object.assign(new Error("throttled"), {
      body: {
        errors: {
          graphQLErrors: [{ message: "throttled", extensions: { code: "THROTTLED" } }],
        },
      },
    });
    install(() => {
      throw thrown;
    });
    const fromClient = await settingsAction(
      args("/app/settings", { method: "POST", body: settingsForm() }),
    );
    expect(JSON.stringify(fromClient)).not.toContain("throttled");

    install(() => {
      throw new Response(null, { status: 401 });
    });
    await expect(
      settingsAction(args("/app/settings", { method: "POST", body: settingsForm() })),
    ).rejects.toBeInstanceOf(Response);
  });
});

describe("product lead time loader and action", () => {
  it("loads app-owned lead times and treats a missing metafield as 0", async () => {
    const calls = install(() => ({
      data: {
        products: {
          pageInfo: { hasNextPage: true, endCursor: "next" },
          nodes: [
            { id: "gid://shopify/Product/1", title: "A", metafield: { value: "3" } },
            { id: "gid://shopify/Product/2", title: "B", metafield: null },
            { id: "gid://shopify/Product/3", title: "C", metafield: { value: "x" } },
          ],
        },
      },
    }));

    const result = await productsLoader(
      args("/app/settings/products?q=shirt&after=cursor"),
    );
    expect(calls[0]?.variables).toMatchObject({
      query: "shirt",
      after: "cursor",
      namespace: LEAD_TIME_METAFIELD_NAMESPACE,
      key: LEAD_TIME_METAFIELD_KEY,
    });
    expect(result).toMatchObject({
      ok: true,
      products: [
        { id: "gid://shopify/Product/1", leadTimeDays: "3", invalid: false },
        { id: "gid://shopify/Product/2", leadTimeDays: "0", originalLead: "0", invalid: false },
        { id: "gid://shopify/Product/3", leadTimeDays: "x", invalid: true },
      ],
    });
  });

  it("writes only changed lead times to the product metafield", async () => {
    const calls = install(saveHandler);
    const form = new FormData();
    form.append("productId", "gid://shopify/Product/1");
    form.set("lead.1", "4");
    form.set("original.1", "3");
    form.append("productId", "gid://shopify/Product/2");
    form.set("lead.2", "0");
    form.set("original.2", "0");

    const result = await productsAction(args("/app/settings/products", { method: "POST", body: form }));
    expect(result).toEqual({ ok: true, unchanged: false });
    const metafields = mutationMetafields(calls);
    expect(metafields).toEqual([
      {
        ownerId: "gid://shopify/Product/1",
        namespace: LEAD_TIME_METAFIELD_NAMESPACE,
        key: LEAD_TIME_METAFIELD_KEY,
        type: "number_integer",
        value: "4",
      },
    ]);
  });

  it("does not call Shopify when nothing changed or the input is invalid", async () => {
    const unchangedCalls = install(saveHandler);
    const same = new FormData();
    same.append("productId", "gid://shopify/Product/1");
    same.set("lead.1", "2");
    same.set("original.1", "2");
    expect(
      await productsAction(args("/app/settings/products", { method: "POST", body: same })),
    ).toEqual({ ok: true, unchanged: true });
    expect(unchangedCalls).toHaveLength(0);

    const invalidCalls = install(saveHandler);
    const bad = new FormData();
    bad.append("productId", "gid://shopify/Product/1");
    bad.set("lead.1", "-1");
    bad.set("original.1", "0");
    const invalid = await productsAction(
      args("/app/settings/products", { method: "POST", body: bad }),
    );
    expect(invalid).toMatchObject({ ok: false, fieldErrors: { "gid://shopify/Product/1": expect.any(String) } });
    expect(invalidCalls).toHaveLength(0);

    const forged = new FormData();
    forged.append("productId", "gid://shopify/Shop/1");
    forged.set("lead.1", "1");
    forged.set("original.1", "0");
    expect(
      await productsAction(args("/app/settings/products", { method: "POST", body: forged })),
    ).toMatchObject({ ok: false, formError: expect.stringContaining("商品ID") });
  });

  it("asks the merchant to re-approve scopes when a product write is denied", async () => {
    const denied = Object.assign(new Error("Access denied for Product"), {
      body: {
        errors: {
          graphQLErrors: [
            {
              message: "Access denied for Product",
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        },
      },
    });
    install(() => {
      throw denied;
    });
    const form = new FormData();
    form.append("productId", "gid://shopify/Product/1");
    form.set("lead.1", "4");
    form.set("original.1", "0");
    const result = await productsAction(
      args("/app/settings/products", { method: "POST", body: form }),
    );
    expect(result).toMatchObject({ ok: false, formError: expect.stringContaining("権限") });
    expect(JSON.stringify(result)).not.toContain("Access denied");
  });
});

describe("home setup guide", () => {
  it("reports whether settings have been saved", async () => {
    install(() => ({ data: { currentAppInstallation: { metafield: null } } }));
    expect(await homeLoader(args("/app"))).toEqual({ settingsStatus: "missing" });

    install(() => ({
      data: {
        currentAppInstallation: { metafield: { value: JSON.stringify(DEFAULT_SETTINGS_V1) } },
      },
    }));
    expect(await homeLoader(args("/app"))).toEqual({ settingsStatus: "ok" });

    install(() => new Response("no", { status: 503 }));
    expect(await homeLoader(args("/app"))).toEqual({ settingsStatus: "unknown" });
  });
});

describe("navigation and storefront contract", () => {
  it("uses the app nav and the same metafield the theme extension reads", () => {
    const nav = readFileSync("app/routes/app.tsx", "utf8");
    expect(nav).toContain("<s-app-nav>");
    expect(nav).toContain('rel="home"');
    expect(nav).not.toContain("s-tabs");
    expect(nav).toContain('href="/app/settings/products"');

    const liquid = readFileSync(
      "extensions/delivery-cart-block/snippets/delivery-picker.liquid",
      "utf8",
    );
    expect(liquid).toContain(
      `app.metafields.${SETTINGS_METAFIELD_NAMESPACE}.${SETTINGS_METAFIELD_KEY}.value`,
    );
    expect(liquid).toContain("metafields.app.lead_time_days");
  });
});

describe("shouldRevalidate", () => {
  it("keeps a failed form on screen and refreshes after a successful save", () => {
    expect(
      settingsShouldRevalidate({
        actionResult: { ok: false, formError: null, fieldErrors: {} },
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(false);
    expect(
      settingsShouldRevalidate({
        actionResult: { ok: true },
        defaultShouldRevalidate: true,
      } as never),
    ).toBe(true);
    expect(
      productsShouldRevalidate({
        actionResult: undefined,
        defaultShouldRevalidate: false,
      } as never),
    ).toBe(false);
  });
});

function install(
  handler: (query: string, variables?: Record<string, unknown>) => unknown | Response,
) {
  const calls: { query: string; variables?: Record<string, unknown> }[] = [];
  adminMock.mockResolvedValue({
    admin: {
      graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
        calls.push({ query, variables: options?.variables });
        const payload = handler(query, options?.variables);
        if (payload instanceof Response) return payload;
        if (payload instanceof Error) throw payload;
        return Response.json(payload);
      },
    },
  });
  return calls;
}

function saveHandler(query: string) {
  if (query.includes("CurrentAppInstallationId")) {
    return { data: { currentAppInstallation: { id: "gid://shopify/AppInstallation/9" } } };
  }
  if (query.includes("SetAppMetafields")) {
    return { data: { metafieldsSet: { metafields: [{ id: "1" }], userErrors: [] } } };
  }
  throw new Error(`unexpected query: ${query}`);
}

function args(pathname: string, init?: { method: string; body: FormData }): LoaderFunctionArgs {
  const request = new Request(`https://example.com${pathname}`, init);
  return {
    request,
    url: new URL(request.url),
    pattern: pathname,
    params: {},
    context: {},
  };
}

function settingsForm(overrides: {
  cutoff?: string;
  holidays?: string;
  newYearPreset?: boolean;
  slots?: string[];
  prefectureDays?: Record<string, string>;
  senderName?: string;
} = {}): FormData {
  const form = new FormData();
  form.set("cutoff", overrides.cutoff ?? "15:00");
  if (overrides.newYearPreset !== false) form.set("newYearPreset", "true");
  form.append("closedWeekdays", "0");
  const slots = overrides.slots ?? [
    "morning",
    "afternoon_early",
    "afternoon_late",
    "evening",
    "night",
  ];
  for (const slot of slots) form.append("slots", slot);
  form.set("defaultRegionDays", "2");
  form.set("selectableWindowDays", "30");
  form.set("holidays", overrides.holidays ?? "");
  form.set("senderName", overrides.senderName ?? "");
  for (const [code, days] of Object.entries(overrides.prefectureDays ?? {})) {
    form.set(`prefectureDays.${code}`, days);
  }
  return form;
}

function savedSettings(calls: { query: string; variables?: Record<string, unknown> }[]) {
  return migrate(JSON.parse(mutationMetafields(calls)[0]?.value ?? ""));
}

function mutationMetafields(calls: { query: string; variables?: Record<string, unknown> }[]) {
  const mutation = calls.find((call) => call.query.includes("SetAppMetafields"));
  return (mutation?.variables?.metafields ?? []) as {
    ownerId: string;
    namespace: string;
    key: string;
    type: string;
    value: string;
  }[];
}
