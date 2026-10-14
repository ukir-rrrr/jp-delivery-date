import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { jstDateTime } from "@domain/calendar/jst";
import { parseLocalDate, type LocalDate } from "@domain/calendar/local-date";
import { yamatoPreview, yamatoRow } from "@domain/carriers/yamato";
import { orderMatchesFilter, parseOrderListStatus } from "@domain/order/list-filter";
import { normalizeDeliveryOrder } from "@domain/order/normalize-order";
import { AdminApiError, loadSettings } from "@infra/graphql/admin";
import { fetchOrderPage, orderToInput } from "@infra/orders/load-orders";
import { exportedOrderIds } from "../export-log.server";
import { orderNumericId } from "../export-request";
import { OrdersScreen, type OrdersScreenRow } from "../orders-screen";
import { authenticate } from "../shopify.server";

const FULFILLMENT_LABELS: Record<string, string> = {
  UNFULFILLED: "未発送",
  PARTIALLY_FULFILLED: "一部発送",
  FULFILLED: "発送済み",
  RESTOCKED: "返品済み",
  PENDING_FULFILLMENT: "発送待ち",
  OPEN: "処理中",
  IN_PROGRESS: "処理中",
  ON_HOLD: "保留",
  SCHEDULED: "発送予定",
  REQUEST_DECLINED: "拒否",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const after = url.searchParams.get("after");
  if (after && after.length > 2000) {
    return { ok: false as const, reason: "bad_cursor" as const };
  }
  const loaded = await loadSettings(admin);
  if (!loaded.ok) return loaded;

  const status = parseOrderListStatus(url.searchParams.get("status"));
  const missingDate = url.searchParams.get("missing") === "1";
  let deliveryDate: LocalDate | null = null;
  let dateError: string | null = null;
  const rawDate = url.searchParams.get("date");
  if (rawDate && !missingDate) {
    try {
      deliveryDate = parseLocalDate(rawDate);
    } catch {
      dateError = "配達希望日の絞り込みは YYYY-MM-DD で指定してください。";
    }
  }

  const shipDate = jstDateTime(Date.now()).date;
  let page;
  try {
    page = await fetchOrderPage(admin, after);
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof AdminApiError) return { ok: false as const, reason: error.code };
    throw error;
  }

  const exported = await exportedOrderIds(
    session.shop,
    "yamato",
    page.nodes.map((node) => node.id),
  );
  const listed = page.nodes.map((node) => {
    const order = normalizeDeliveryOrder(orderToInput(node, shipDate));
    const view = yamatoRow(order, loaded.settings);
    return {
      order,
      issues: view.issues,
      preview: yamatoPreview(view.cells),
      fulfillmentStatus: node.displayFulfillmentStatus,
      exported: exported.has(node.id),
    };
  });
  const filter = {
    status,
    deliveryDate: missingDate ? null : deliveryDate,
    missingDate,
  };
  const rows = listed.filter((row) => orderMatchesFilter({
    order: row.order,
    exported: row.exported,
    hasIssues: row.issues.length > 0,
  }, filter)).flatMap((row) => {
    const fieldId = orderNumericId(row.order.orderId);
    if (!fieldId) return [];
    const view: OrdersScreenRow = {
      orderId: row.order.orderId,
      fieldId,
      orderName: row.order.orderName || row.order.orderId,
      fulfillmentLabel: FULFILLMENT_LABELS[row.fulfillmentStatus ?? ""] ?? "状態なし",
      exported: row.exported,
      deliveryDate: row.order.deliveryDate ?? "",
      slot: row.order.slot,
      issues: row.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
      })),
      preview: row.preview,
      defaultSelected: row.issues.length === 0 && !row.exported,
    };
    return [view];
  });

  return {
    ok: true as const,
    settingsStatus: loaded.status,
    billingReady: Boolean(loaded.settings.sender.yamatoBillingCode && loaded.settings.sender.yamatoFreightNumber),
    dateError,
    justExported: url.searchParams.get("exported") === "1",
    filter: {
      status,
      deliveryDate: rawDate && !dateError ? rawDate : "",
      missingDate,
    },
    rows,
    pageInfo: page.pageInfo,
    pcdRedacted: listed.some((row) => row.order.pcdRedacted),
    examined: page.nodes.length,
  };
};

export default function OrdersRoute() {
  const data = useLoaderData<typeof loader>();
  return <OrdersScreen data={data} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
