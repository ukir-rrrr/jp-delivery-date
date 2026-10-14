import { useState } from "react";
import type { FormEvent } from "react";
import { Form } from "react-router";
import { SLOTS } from "@domain/delivery/slot";
import { SLOT_LABELS_JA } from "@domain/delivery/labels";
import { adminLoadMessage } from "./admin-copy";
import { useAdminLoading } from "./admin-feedback";
import { EXPORT_CARRIERS } from "./export-carriers";

export interface OrdersScreenRow {
  orderId: string;
  fieldId: string;
  orderName: string;
  fulfillmentLabel: string;
  exported: boolean;
  deliveryDate: string;
  slot: string;
  issues: { code: string; message: string }[];
  preview: { label: string; value: string }[];
  defaultSelected: boolean;
}

export type OrdersPageData =
  | { ok: false; reason: "unavailable" | "access_denied" | "bad_cursor" }
  | {
      ok: true;
      settingsStatus: "missing" | "ok" | "invalid";
      billingReady: boolean;
      carrier: { id: string; label: string; button: string; note: string };
      carrierError: string | null;
      dateError: string | null;
      justExported: boolean;
      filter: { status: string; deliveryDate: string; missingDate: boolean };
      rows: OrdersScreenRow[];
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      pcdRedacted: boolean;
      examined: number;
    };

const STATUSES: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "unexported", label: "未出力" },
  { value: "exported", label: "出力済み" },
  { value: "needs_review", label: "要確認" },
];

export function OrdersScreen({ data }: { data: OrdersPageData }) {
  const busy = useAdminLoading();
  const [pending, setPending] = useState(false);
  const [exportError, setExportError] = useState<{
    message: string;
    failures: { orderName: string; issues: { message: string }[] }[];
  } | null>(null);

  if (!data.ok) {
    return (
      <s-page heading="送り状CSV">
        <s-banner tone="critical" heading="注文を表示できません">
          {adminLoadMessage(data.reason, "orders")}
        </s-banner>
      </s-page>
    );
  }

  async function onExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExportError(null);
    setPending(true);
    const form = event.currentTarget;
    try {
      if (typeof shopify === "undefined") {
        setExportError({ message: "アプリの画面から書き出してください。", failures: [] });
        return;
      }
      const token = await shopify.idToken();
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
      });
      if (!response.ok) {
        setExportError(await readExportError(response));
        return;
      }
      const blob = await response.blob();
      const filename = filenameOf(response.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        const next = new URL(window.location.href);
        next.searchParams.set("exported", "1");
        window.location.assign(next.toString());
      }, 400);
    } catch {
      setExportError({ message: "CSVを書き出せませんでした。通信を確認してもう一度お試しください。", failures: [] });
    } finally {
      setPending(false);
    }
  }

  return (
    <s-page heading="送り状CSV">
      <s-banner tone="info" heading="購入者の情報は保存しません">
        氏名・住所・電話は書き出すたびにShopifyから読み、この画面とCSV以外には残しません。
        出力済みの記録は注文IDだけです。日付と時間帯の修正はこの画面だけに残り、注文には書き戻しません。
      </s-banner>
      {data.pcdRedacted ? (
        <s-banner tone="critical" heading="PCD未承認">
          氏名・住所・電話が空で返っています。保護された顧客データ（レベル2）が未承認のときは送り状を出しません。
          開発ストアでは審査不要です。本番ストアはパートナーダッシュボードから申請してください。
        </s-banner>
      ) : null}
      {data.settingsStatus === "invalid" ? (
        <s-banner tone="critical" heading="設定を読み取れません">
          設定画面で保存し直すまで、CSVは書き出せません。
        </s-banner>
      ) : null}
      {data.carrier.id === "yamato" && !data.billingReady ? (
        <s-banner tone="warning" heading="ヤマトの請求先コード">
          発払いの送り状には、設定の「ご請求先顧客コード」と「運賃管理番号」が必要です。{" "}
          <s-link href="/app/settings">設定を開く</s-link>
        </s-banner>
      ) : null}
      {data.carrierError ? (
        <s-banner tone="warning" heading="運送会社">
          {data.carrierError}
        </s-banner>
      ) : null}
      {data.justExported ? (
        <s-banner tone="success" heading="CSVを書き出しました">
          選んだ注文に出力済みの印を付けました。同じ注文はあとからもう一度書き出せます。
        </s-banner>
      ) : null}
      {data.dateError ? (
        <s-banner tone="warning" heading="絞り込み">
          {data.dateError}
        </s-banner>
      ) : null}
      {exportError ? (
        <s-banner tone="critical" heading="書き出せませんでした">
          <s-paragraph>{exportError.message}</s-paragraph>
          {exportError.failures.length > 0 ? (
            <s-unordered-list>
              {exportError.failures.map((failure) => (
                <s-list-item key={failure.orderName || failure.issues[0]?.message}>
                  {failure.orderName ? `${failure.orderName}: ` : ""}
                  {failure.issues.map((issue) => issue.message).join(" ")}
                </s-list-item>
              ))}
            </s-unordered-list>
          ) : null}
        </s-banner>
      ) : null}

      <Form method="get" action="/app/orders">
        <s-section heading="絞り込み">
          <s-paragraph>
            直近の注文を50件ずつ読み、その中から絞り込みます。キャンセル済みは含みません。
            {data.carrier.note}
          </s-paragraph>
          <input type="hidden" name="carrier" value={data.carrier.id} />
          <s-stack direction="inline" gap="base">
            <s-date-field
              label="配達希望日"
              name="date"
              defaultValue={data.filter.deliveryDate}
              disabled={data.filter.missingDate}
            />
            <s-select label="状態" name="status">
              {STATUSES.map((status) => (
                <s-option
                  key={status.value}
                  value={status.value}
                  defaultSelected={data.filter.status === status.value}
                >
                  {status.label}
                </s-option>
              ))}
            </s-select>
            <s-checkbox
              label="日時指定なし（今すぐ購入を含む）"
              name="missing"
              value="1"
              defaultChecked={data.filter.missingDate}
              details="カートを通らない注文は、希望日が保存されていません。"
            />
            <s-button type="submit" variant="secondary" disabled={busy}>
              絞り込む
            </s-button>
          </s-stack>
        </s-section>
      </Form>

      <Form method="get" action="/app/orders">
        <s-section heading="運送会社">
          <s-stack direction="inline" gap="base">
            <s-select label="書き出すCSV" name="carrier">
              {EXPORT_CARRIERS.map((carrier) => (
                <s-option key={carrier.id} value={carrier.id} defaultSelected={data.carrier.id === carrier.id}>
                  {carrier.label}
                </s-option>
              ))}
            </s-select>
            {data.filter.deliveryDate ? <input type="hidden" name="date" value={data.filter.deliveryDate} /> : null}
            {data.filter.status !== "all" ? <input type="hidden" name="status" value={data.filter.status} /> : null}
            {data.filter.missingDate ? <input type="hidden" name="missing" value="1" /> : null}
            <s-button type="submit" variant="secondary" disabled={busy}>
              この運送会社で見る
            </s-button>
          </s-stack>
        </s-section>
      </Form>

      <form method="post" action={`/app/export/${data.carrier.id}`} onSubmit={onExport}>
        <s-section heading={`注文 ${data.rows.length}件（読み込み ${data.examined}件）`}>
          {data.rows.length === 0 ? (
            <s-paragraph>このページには、条件に合う注文がありません。</s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="inline">選択</s-table-header>
                <s-table-header listSlot="primary">注文</s-table-header>
                <s-table-header listSlot="labeled">配達希望日</s-table-header>
                <s-table-header listSlot="labeled">時間帯</s-table-header>
                <s-table-header listSlot="secondary">確認</s-table-header>
                <s-table-header listSlot="labeled">プレビュー</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.rows.map((row) => (
                  <OrderRow key={row.orderId} row={row} />
                ))}
              </s-table-body>
            </s-table>
          )}
          <s-stack direction="inline" gap="base">
            <s-button
              type="submit"
              variant="primary"
              disabled={pending || data.rows.length === 0 || data.settingsStatus === "invalid" || data.carrierError !== null}
            >
              {pending ? "書き出しています" : data.carrier.button}
            </s-button>
            {data.pageInfo.hasNextPage && data.pageInfo.endCursor ? (
              <s-link href={nextHref(data)}>次の50件</s-link>
            ) : null}
          </s-stack>
        </s-section>
      </form>
    </s-page>
  );
}

function OrderRow({ row }: { row: OrdersScreenRow }) {
  return (
    <s-table-row>
      <s-table-cell>
        <s-checkbox
          accessibilityLabel={`${row.orderName}を書き出す`}
          name="orderId"
          value={row.orderId}
          defaultChecked={row.defaultSelected}
        />
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="block" gap="base">
          <s-text type="strong">{row.orderName}</s-text>
          <s-stack direction="inline" gap="base">
            <s-badge>{row.fulfillmentLabel}</s-badge>
            {row.exported ? <s-badge tone="success">出力済み</s-badge> : <s-badge>未出力</s-badge>}
          </s-stack>
        </s-stack>
      </s-table-cell>
      <s-table-cell>
        <s-date-field
          label={`${row.orderName}の配達希望日`}
          labelAccessibilityVisibility="exclusive"
          name={`date:${row.fieldId}`}
          defaultValue={row.deliveryDate}
        />
      </s-table-cell>
      <s-table-cell>
        <s-select
          label={`${row.orderName}の時間帯`}
          labelAccessibilityVisibility="exclusive"
          name={`slot:${row.fieldId}`}
        >
          {SLOTS.map((slot) => (
            <s-option key={slot} value={slot} defaultSelected={row.slot === slot}>
              {SLOT_LABELS_JA[slot]}
            </s-option>
          ))}
        </s-select>
      </s-table-cell>
      <s-table-cell>
        {row.issues.length === 0 ? (
          <s-badge tone="success">OK</s-badge>
        ) : (
          <s-stack direction="block" gap="base">
            <s-badge tone={row.issues.some((issue) => issue.code === "pcd_redacted") ? "critical" : "warning"}>
              要確認
            </s-badge>
            {row.issues.map((issue) => (
              <s-text key={`${issue.code}-${issue.message}`} color="subdued">
                {issue.message}
              </s-text>
            ))}
          </s-stack>
        )}
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="block" gap="base">
          {row.preview.map((line) => (
            <s-text key={line.label} color="subdued">
              {line.label}: {line.value || "—"}
            </s-text>
          ))}
        </s-stack>
      </s-table-cell>
    </s-table-row>
  );
}

function nextHref(data: Extract<OrdersPageData, { ok: true }>): string {
  const params = new URLSearchParams();
  if (data.carrier.id !== "yamato") params.set("carrier", data.carrier.id);
  if (data.filter.deliveryDate) params.set("date", data.filter.deliveryDate);
  if (data.filter.status !== "all") params.set("status", data.filter.status);
  if (data.filter.missingDate) params.set("missing", "1");
  if (data.pageInfo.endCursor) params.set("after", data.pageInfo.endCursor);
  return `/app/orders?${params.toString()}`;
}

function filenameOf(header: string | null): string {
  const match = /filename="([\w.-]+)"/.exec(header ?? "");
  return match?.[1] ?? "label.csv";
}

async function readExportError(response: Response): Promise<{
  message: string;
  failures: { orderName: string; issues: { message: string }[] }[];
}> {
  try {
    const body = (await response.json()) as {
      message?: unknown;
      failures?: { orderName?: unknown; issues?: { message?: unknown }[] }[];
    };
    const failures = Array.isArray(body.failures)
      ? body.failures.map((failure) => ({
          orderName: typeof failure.orderName === "string" ? failure.orderName : "",
          issues: Array.isArray(failure.issues)
            ? failure.issues.flatMap((issue) =>
                typeof issue.message === "string" ? [{ message: issue.message }] : [],
              )
            : [],
        }))
      : [];
    return {
      message: typeof body.message === "string" ? body.message : "CSVを書き出せませんでした。",
      failures,
    };
  } catch {
    return { message: "CSVを書き出せませんでした。", failures: [] };
  }
}
