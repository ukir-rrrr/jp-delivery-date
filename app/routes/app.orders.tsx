import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Orders() {
  return (
    <s-page heading="送り状CSV">
      <s-banner tone="info" heading="PCD（保護された顧客データ）">
        氏名・住所・電話はレベル2の顧客データです。未承認のフィールドは null のまま
        HTTP 200 で返ります。空の送り状を出さず、「PCD未承認」バナーを出す方針です。
        開発ストアでは審査不要です。本番利用前にパートナーダッシュボードから申請してください。
      </s-banner>

      <s-section heading="W3 で実装する画面">
        <s-paragraph>
          Polaris のインデックス表で注文を一覧し、未出力・配達日・キャリア・要確認・日時指定なしで絞り込みます。
          Buy Now 注文は行内で日付・時間帯を入力してからエクスポートできます（編集はメモリ上のみ。永続化しません）。
        </s-paragraph>
        <s-unordered-list>
          <s-list-item>
            ヤマト B2クラウド —{" "}
            <s-link href="/app/export/yamato">/app/export/yamato</s-link>
          </s-list-item>
          <s-list-item>
            佐川 e-飛伝III —{" "}
            <s-link href="/app/export/sagawa">/app/export/sagawa</s-link>
          </s-list-item>
          <s-list-item>
            ゆうプリR —{" "}
            <s-link href="/app/export/yupackR">/app/export/yupackR</s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
