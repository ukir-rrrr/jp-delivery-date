import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { LocalDate } from "@domain/calendar/local-date";
import { earliestDate, type Reason } from "@domain/delivery/earliest-date";
import { formatDeliveryDateLabel, SLOT_LABELS_JA } from "@domain/delivery/labels";
import { PREFECTURES } from "@domain/delivery/region";
import { SLOTS } from "@domain/delivery/slot";
import type { SettingsV1 } from "@domain/delivery/settings";
import { loadSettings, saveSettingsMetafield } from "@infra/graphql/admin";
import { settingsFromForm, type SettingsFieldFailure } from "@infra/metafields/settings-form";
import { adminLoadMessage, INVALID_SETTINGS_MESSAGE } from "../admin-copy";
import { useAdminLoading, useSavedToast } from "../admin-feedback";
import { metafieldSaveFailure } from "../save-failure";
import { authenticate } from "../shopify.server";

const WEEKDAYS: { value: string; label: string }[] = [
  { value: "1", label: "月" },
  { value: "2", label: "火" },
  { value: "3", label: "水" },
  { value: "4", label: "木" },
  { value: "5", label: "金" },
  { value: "6", label: "土" },
  { value: "0", label: "日" },
];

const REASON_LABELS: Record<string, string> = {
  before_cutoff: "カットオフ前なので、当日から出荷を数えます",
  past_cutoff: "カットオフ以降なので、翌日から出荷を数えます",
  lead_time: "リードタイム（出荷営業日）",
  region_days: "都道府県の加算（暦日）",
  unknown_prefecture: "都道府県不明のため、最も遅い地域日数",
  snapped_to_open_day: "休業日を避けて、次の出荷できる日へ",
  all_closed_horizon: "出荷できる日が範囲内にありません",
  invalid_input: "設定が不正です",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const loaded = await loadSettings(admin);
  if (!loaded.ok) return loaded;
  const preview = earliestDate({
    now: { epochMs: Date.now(), timeZone: "Asia/Tokyo" },
    settings: loaded.settings,
    items: [],
  });
  return { ...loaded, preview };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const parsed = settingsFromForm(await request.formData());
  if (!parsed.ok) return parsed;
  try {
    await saveSettingsMetafield(admin, parsed.settings);
  } catch (error) {
    if (error instanceof Response) throw error;
    return metafieldSaveFailure(error);
  }
  return { ok: true as const };
};

export function shouldRevalidate({
  actionResult,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (isFailedSave(actionResult)) return false;
  return defaultShouldRevalidate;
}

function isFailedSave(result: unknown): result is SettingsFieldFailure {
  return Boolean(
    result && typeof result === "object" && "ok" in result && result.ok === false,
  );
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const busy = useAdminLoading();
  useSavedToast(actionData?.ok ? actionData : undefined, "設定を保存しました");

  if (!data.ok) {
    return (
      <s-page heading="設定">
        <s-banner tone="critical" heading="設定を表示できません">
          {adminLoadMessage(data.reason, "settings")}
        </s-banner>
      </s-page>
    );
  }

  const fieldErrors = actionData && !actionData.ok ? actionData.fieldErrors : {};
  const formKey = `${data.status}:${JSON.stringify(data.settings)}`;

  return (
    <s-page heading="設定">
      {data.status === "missing" ? (
        <s-banner tone="info" heading="まだ保存していません">
          表示中の値は初期値です。保存するとカートの日付候補に反映されます。
        </s-banner>
      ) : null}
      {data.status === "invalid" ? (
        <s-banner tone="critical" heading="保存済みの設定">
          {INVALID_SETTINGS_MESSAGE}
        </s-banner>
      ) : null}
      {actionData && !actionData.ok ? (
        <s-banner tone="critical" heading="保存できませんでした">
          {actionData.formError ?? "赤く表示された項目を確認してください。"}
        </s-banner>
      ) : null}

      <Form method="post" data-save-bar data-discard-confirmation key={formKey}>
        <s-section heading="最短日の計算順">
          <s-paragraph>
            商品ごとのリードタイムは{" "}
            <s-link href="/app/settings/products">商品リードタイム</s-link>
            で保存します。都道府県が未選択のときは、標準日数と都道府県ごとの指定のうち最も大きい日数を使います。
          </s-paragraph>
          <s-ordered-list>
            <s-list-item>カットオフ（JST）。その時刻以降は翌日から出荷を数えます。</s-list-item>
            <s-list-item>カート内のリードタイムの最大値を、出荷できる日だけで数えます。</s-list-item>
            <s-list-item>都道府県の加算日数を、暦の日数で足します。</s-list-item>
            <s-list-item>その日が出荷できない日なら、次の出荷できる日まで進め、選択できる期間を出します。</s-list-item>
          </s-ordered-list>
        </s-section>

        <s-section heading="休業日">
          <s-stack direction="block" gap="base">
            <s-checkbox
              label="年始（12/29〜1/3）を出荷停止にする"
              name="newYearPreset"
              value="true"
              defaultChecked={data.settings.newYearPreset}
              details="毎年同じ期間です。個別の日付としては保存しません。"
            />
            <s-text-area
              label="個別の休業日"
              name="holidays"
              defaultValue={data.settings.holidays.join("\n")}
              rows={8}
              details="YYYY-MM-DD を1行に1日。振替休日もここに追加します。"
              error={fieldErrors.holidays}
            />
          </s-stack>
        </s-section>

        <s-section heading="出荷できない曜日">
          <s-paragraph>選んだ曜日は出荷できません。未選択なら毎日出荷できます。</s-paragraph>
          {fieldErrors.closedWeekdays ? (
            <s-text tone="critical">{fieldErrors.closedWeekdays}</s-text>
          ) : null}
          <s-stack direction="block" gap="small">
            {WEEKDAYS.map((day) => (
              <s-checkbox
                key={day.value}
                label={day.label}
                name="closedWeekdays"
                value={day.value}
                defaultChecked={data.settings.closedWeekdays.some((closed) => String(closed) === day.value)}
              />
            ))}
          </s-stack>
        </s-section>

        <s-section heading="カットオフ">
          <s-text-field
            label="カットオフ時刻（JST）"
            name="cutoff"
            defaultValue={data.settings.cutoff}
            details="この時刻以降の注文は、翌日から出荷を数えます。例: 15:00"
            error={fieldErrors.cutoff}
          />
        </s-section>

        <s-section heading="時間帯">
          <s-paragraph>カートで選べる配達時間帯です。1つ以上必要です。</s-paragraph>
          {fieldErrors.slots ? <s-text tone="critical">{fieldErrors.slots}</s-text> : null}
          <s-stack direction="block" gap="small">
            {SLOTS.map((slot) => (
              <s-checkbox
                key={slot}
                label={SLOT_LABELS_JA[slot]}
                name="slots"
                value={slot}
                defaultChecked={data.settings.slots.includes(slot)}
              />
            ))}
          </s-stack>
        </s-section>

        <s-section heading="都道府県ごとの加算日数">
          <s-stack direction="block" gap="base">
            <s-number-field
              label="標準の加算日数"
              name="defaultRegionDays"
              defaultValue={String(data.settings.defaultRegionDays)}
              min={0}
              max={366}
              step={1}
              inputMode="numeric"
              details="個別指定のない都道府県に使います。都道府県が不明なときは、この値と個別指定のうち大きい方です。"
              error={fieldErrors.defaultRegionDays}
            />
            <s-number-field
              label="選択できる日数"
              name="selectableWindowDays"
              defaultValue={String(data.settings.selectableWindowDays)}
              min={1}
              max={366}
              step={1}
              inputMode="numeric"
              details="最短日から数えて、カートに出す日数です。休業日も含めて数えます。"
              error={fieldErrors.selectableWindowDays}
            />
            <s-paragraph>空欄の都道府県は標準日数です。0 は加算なしです。</s-paragraph>
            <s-grid gridTemplateColumns="repeat(auto-fill, minmax(12rem, 1fr))" gap="base">
              {PREFECTURES.map((prefecture) => {
                const stored = data.settings.prefectureLeadDays[prefecture.code];
                return (
                  <s-number-field
                    key={prefecture.code}
                    label={prefecture.name}
                    name={`prefectureDays.${prefecture.code}`}
                    defaultValue={stored === undefined ? "" : String(stored)}
                    min={0}
                    max={366}
                    step={1}
                    inputMode="numeric"
                    error={fieldErrors[`prefectureDays.${prefecture.code}`]}
                  />
                );
              })}
            </s-grid>
          </s-stack>
        </s-section>

        <s-section heading="送り主">
          <s-paragraph>
            送り状CSVの送り主です。購入者の氏名・住所・電話は保存しません。
          </s-paragraph>
          <s-stack direction="block" gap="base">
            <SenderFields settings={data.settings} fieldErrors={fieldErrors} />
          </s-stack>
        </s-section>

        <s-button type="submit" variant="primary" loading={busy} disabled={busy}>
          保存
        </s-button>
      </Form>

      <s-section heading="保存済み設定のプレビュー">
        <s-paragraph>
          リードタイム 0 日、都道府県不明（最も遅い地域）で計算しています。
          画面上の未保存の変更は含みません。
        </s-paragraph>
        <Preview
          earliest={data.preview.earliest}
          count={data.preview.selectable.length}
          reasons={data.preview.reasons}
        />
      </s-section>
    </s-page>
  );
}

function SenderFields({
  settings,
  fieldErrors,
}: {
  settings: SettingsV1;
  fieldErrors: Record<string, string>;
}) {
  const sender = settings.sender;
  return (
    <>
      <s-text-field label="名称" name="senderName" defaultValue={sender.name ?? ""} error={fieldErrors.senderName} />
      <s-text-field
        label="郵便番号"
        name="senderPostalCode"
        defaultValue={sender.postalCode ?? ""}
        error={fieldErrors.senderPostalCode}
      />
      <s-text-field
        label="都道府県"
        name="senderPrefecture"
        defaultValue={sender.prefecture ?? ""}
        error={fieldErrors.senderPrefecture}
      />
      <s-text-field
        label="住所1"
        name="senderAddress1"
        defaultValue={sender.address1 ?? ""}
        error={fieldErrors.senderAddress1}
      />
      <s-text-field
        label="住所2"
        name="senderAddress2"
        defaultValue={sender.address2 ?? ""}
        error={fieldErrors.senderAddress2}
      />
      <s-text-field
        label="電話番号"
        name="senderPhone"
        defaultValue={sender.phone ?? ""}
        error={fieldErrors.senderPhone}
      />
    </>
  );
}

function Preview({
  earliest,
  count,
  reasons,
}: {
  earliest: LocalDate | null;
  count: number;
  reasons: Reason[];
}) {
  return (
    <s-stack direction="block" gap="base">
      <s-paragraph>
        最短日: {earliest ? formatDeliveryDateLabel(earliest, "ja") : "なし"}
        （選択できる日 {count} 日）
      </s-paragraph>
      <s-unordered-list>
        {reasons.map((reason, index) => (
          <s-list-item key={`${reason.code}-${index}`}>
            {REASON_LABELS[reason.code] ?? reason.code}
          </s-list-item>
        ))}
      </s-unordered-list>
    </s-stack>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
