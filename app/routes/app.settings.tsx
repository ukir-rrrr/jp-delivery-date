import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Settings() {
  return (
    <s-page heading="設定">
      <s-section heading="W3 で実装する項目">
        <s-paragraph>
          設定はスキーマバージョン付きの JSON メタフィールド settings_v1 に
          1 件だけ保存します。店舗メタフィールドへの二重保存はしません。
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>休業日と振替休日、年始プリセット（12/29–1/3）</s-list-item>
          <s-list-item>出荷不可の曜日とカットオフ時刻（JST）</s-list-item>
          <s-list-item>選択可能な時間帯</s-list-item>
          <s-list-item>都道府県ごとの加算日数（未選択時は最悪ケース）</s-list-item>
          <s-list-item>商品リードタイム（app.lead_time_days）</s-list-item>
          <s-list-item>送り主プロフィール（PII ではない加盟店データ）</s-list-item>
        </s-unordered-list>
        <s-paragraph>
          最短日の計算順は、カットオフ（JST・その時刻以降は翌日）→
          商品リードタイムの最大値（出荷営業日）→ 都道府県の加算（暦日）→
          選択窓です。都道府県が未選択のときは、設定された地域日数の最大値を使います。
          休業曜日・祝日・年始（12/29–1/3）は出荷できない日として飛ばします。
          この画面からの保存は次の段階です。カートは保存済みの設定が無いあいだ、初期値で計算します。
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
