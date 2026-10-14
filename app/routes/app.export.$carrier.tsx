import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { jstDateTime } from "@domain/calendar/jst";
import { buildYamatoFile, type YamatoFailure } from "@domain/carriers/yamato";
import { applyDeliveryEdit } from "@domain/order/apply-edit";
import { normalizeDeliveryOrder } from "@domain/order/normalize-order";
import { AdminApiError, loadSettings } from "@infra/graphql/admin";
import { fetchOrdersByIds, orderToInput } from "@infra/orders/load-orders";
import { recordExportedOrders } from "../export-log.server";
import { parseExportForm } from "../export-request";
import { authenticate } from "../shopify.server";

/**
 * Streams a shipping-label CSV. Buyer name, address, and phone are read from
 * Shopify for this request and are not written to ExportLog or to logs.
 * The in-memory date/slot edits are applied only to the file.
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  if (params.carrier !== "yamato") {
    return text("this carrier is not implemented yet", 501);
  }
  const parsed = parseExportForm(await request.formData());
  if (!parsed.ok) return problem(400, parsed.message);

  const loaded = await loadSettings(admin);
  if (!loaded.ok) {
    return problem(503, loaded.reason === "access_denied" ? "設定を読む権限がありません。" : "設定を読み込めませんでした。");
  }
  if (loaded.status === "invalid") {
    return problem(422, "設定を読み取れません。設定画面で保存し直してください。");
  }

  let nodes;
  try {
    nodes = await fetchOrdersByIds(admin, parsed.value.ids);
  } catch (error) {
    if (error instanceof Response) throw error;
    if (error instanceof AdminApiError) {
      return problem(503, "注文を読み込めませんでした。");
    }
    throw error;
  }
  if (nodes.length !== parsed.value.ids.length) {
    return problem(422, "選んだ注文の一部を取得できませんでした。画面を開き直してください。");
  }

  const shipDate = jstDateTime(Date.now()).date;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const orders = [];
  for (const id of parsed.value.ids) {
    const node = byId.get(id);
    if (!node) return problem(422, "選んだ注文の一部を取得できませんでした。画面を開き直してください。");
    let order = normalizeDeliveryOrder(orderToInput(node, shipDate));
    const edit = parsed.value.edits.get(id);
    if (edit) {
      const applied = applyDeliveryEdit(order, edit);
      if (!applied.ok) return problem(400, applied.message);
      order = applied.order;
    }
    orders.push(order);
  }

  const file = buildYamatoFile(orders, loaded.settings);
  if (!file.ok) return problem(422, "書き出せない行があります。日付・文字・住所の長さを確認してください。", file.error);

  await recordExportedOrders(session.shop, "yamato", orders.map((order) => order.orderId));
  const body = new ArrayBuffer(file.value.byteLength);
  new Uint8Array(body).set(file.value);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=Shift_JIS",
      "Content-Disposition": 'attachment; filename="yamato-b2.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  if (params.carrier === "yamato") {
    return text("CSVは注文一覧から書き出します。", 405);
  }
  return text("this carrier is not implemented yet", 501);
};

function problem(status: number, message: string, failures: YamatoFailure[] = []) {
  return Response.json(
    {
      ok: false as const,
      message,
      failures: failures.map((failure) => ({
        orderId: failure.orderId,
        orderName: failure.orderName,
        issues: failure.issues.map((issue) => ({
          code: issue.code,
          message: issue.message,
          field: issue.field ?? null,
          suggestion: issue.suggestion ?? null,
        })),
      })),
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
