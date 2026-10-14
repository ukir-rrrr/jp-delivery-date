const ORDER_GID = /^gid:\/\/shopify\/Order\/(\d+)$/;
export const MAX_EXPORT_ORDERS = 50;

export interface ExportSelection {
  ids: string[];
  edits: Map<string, { date: string; slot: string }>;
}

export function orderNumericId(orderId: string): string | null {
  return ORDER_GID.exec(orderId)?.[1] ?? null;
}

export function parseExportForm(
  form: FormData,
): { ok: true; value: ExportSelection } | { ok: false; message: string } {
  const ids = form
    .getAll("orderId")
    .map(String)
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, message: "注文を1件以上選んでください。" };
  }
  if (ids.length > MAX_EXPORT_ORDERS) {
    return { ok: false, message: `一度に書き出せるのは${MAX_EXPORT_ORDERS}件までです。` };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, message: "同じ注文が重複しています。" };
  }
  const edits = new Map<string, { date: string; slot: string }>();
  for (const id of ids) {
    const numericId = orderNumericId(id);
    if (!numericId) return { ok: false, message: "注文IDが不正です。" };
    const dateKey = `date:${numericId}`;
    const slotKey = `slot:${numericId}`;
    if (!form.has(dateKey) && !form.has(slotKey)) continue;
    edits.set(id, {
      date: text(form.get(dateKey)),
      slot: text(form.get(slotKey)),
    });
  }
  return { ok: true, value: { ids, edits } };
}

function text(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}
