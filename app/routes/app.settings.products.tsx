import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { loadProductLeadTimes, saveProductLeadTimes } from "@infra/graphql/admin";
import {
  leadFieldName,
  MAX_LEAD_TIME_DAYS,
  originalFieldName,
  productNumericId,
} from "@infra/metafields/lead-time";
import { leadTimesFromForm, type LeadTimeFieldFailure } from "@infra/metafields/lead-time-form";
import { adminLoadMessage } from "../admin-copy";
import { useAdminLoading, useSavedToast } from "../admin-feedback";
import { metafieldSaveFailure } from "../save-failure";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  return loadProductLeadTimes(admin, {
    query: url.searchParams.get("q") ?? "",
    after: url.searchParams.get("after"),
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const parsed = leadTimesFromForm(await request.formData());
  if (!parsed.ok) return parsed;
  if (parsed.updates.length === 0) return { ok: true as const, unchanged: true };
  try {
    await saveProductLeadTimes(admin, parsed.updates);
  } catch (error) {
    if (error instanceof Response) throw error;
    return metafieldSaveFailure(error);
  }
  return { ok: true as const, unchanged: false };
};

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (isFailedSave(actionResult)) return false;
  return defaultShouldRevalidate;
}

function isFailedSave(result: unknown): result is LeadTimeFieldFailure {
  return Boolean(
    result && typeof result === "object" && "ok" in result && result.ok === false,
  );
}

export default function ProductLeadTimesPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const busy = useAdminLoading();
  const saved = actionData?.ok ? actionData : undefined;
  useSavedToast(
    saved,
    saved && "unchanged" in saved && saved.unchanged
      ? "変更はありません"
      : "商品リードタイムを保存しました",
  );

  return (
    <s-page heading="商品リードタイム">
      <s-link slot="breadcrumb-actions" href="/app/settings">
        設定
      </s-link>
      <s-section heading="出荷営業日">
        <s-paragraph>
          カート内の商品のうち、いちばん長い日数を使います。未設定は 0 日です。
          ここでの保存先は商品メタフィールド app.lead_time_days だけです。
        </s-paragraph>
        <Form method="get">
          <s-stack direction="inline" gap="base">
            <s-search-field
              label="商品を検索"
              name="q"
              defaultValue={data.query}
              details="商品名や SKU など、管理画面の商品検索と同じ語で絞り込めます。"
            />
            <s-button type="submit" variant="secondary">
              検索
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      {!data.ok ? (
        <s-banner tone="critical" heading="商品を表示できません">
          {adminLoadMessage(data.reason, "products")}
        </s-banner>
      ) : (
        <ProductForm data={data} busy={busy} actionData={actionData} />
      )}
    </s-page>
  );
}

function ProductForm({
  data,
  busy,
  actionData,
}: {
  data: Extract<Awaited<ReturnType<typeof loader>>, { ok: true }>;
  busy: boolean;
  actionData: ReturnType<typeof useActionData<typeof action>>;
}) {
  const fieldErrors = actionData && !actionData.ok ? actionData.fieldErrors : {};
  const formKey = data.products.map((product) => `${product.id}:${product.leadTimeDays}`).join("|");

  return (
    <>
      {actionData && !actionData.ok ? (
        <s-banner tone="critical" heading="保存できませんでした">
          {actionData.formError ?? "赤く表示された商品を確認してください。"}
        </s-banner>
      ) : null}
      {data.products.length === 0 ? (
        <s-section heading="商品">
          <s-paragraph>該当する商品がありません。</s-paragraph>
        </s-section>
      ) : (
        <Form method="post" data-save-bar data-discard-confirmation key={formKey}>
          <s-section heading="このページの商品">
            <s-stack direction="block" gap="base">
              {data.products.map((product) => {
                const numericId = productNumericId(product.id);
                if (!numericId) {
                  return (
                    <s-paragraph key={product.id}>
                      {product.title} の商品IDを読み取れないため、この行は保存しません。
                    </s-paragraph>
                  );
                }
                return (
                  <div key={product.id}>
                    <input type="hidden" name="productId" value={product.id} />
                    <input
                      type="hidden"
                      name={originalFieldName(numericId)}
                      value={product.originalLead}
                    />
                    <s-number-field
                      label={product.title}
                      name={leadFieldName(numericId)}
                      defaultValue={product.leadTimeDays}
                      min={0}
                      max={MAX_LEAD_TIME_DAYS}
                      step={1}
                      inputMode="numeric"
                      details="出荷に必要な営業日"
                      error={
                        fieldErrors[product.id] ??
                        (product.invalid
                          ? `保存済みの値を読み取れません。0〜${MAX_LEAD_TIME_DAYS}の整数にしてください。`
                          : undefined)
                      }
                    />
                  </div>
                );
              })}
            </s-stack>
          </s-section>
          <s-button type="submit" variant="primary" loading={busy} disabled={busy}>
            保存
          </s-button>
        </Form>
      )}
      <s-stack direction="inline" gap="base">
        {data.after ? (
          <s-link href={productsPath(data.query)}>最初のページ</s-link>
        ) : null}
        {data.pageInfo.hasNextPage && data.pageInfo.endCursor ? (
          <s-link href={productsPath(data.query, data.pageInfo.endCursor)}>次の20件</s-link>
        ) : null}
      </s-stack>
    </>
  );
}

function productsPath(query: string, after?: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (after) params.set("after", after);
  const qs = params.toString();
  return qs ? `/app/settings/products?${qs}` : "/app/settings/products";
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
