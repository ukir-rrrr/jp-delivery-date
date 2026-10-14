import { useEffect, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type ExtensionStatus = "unknown" | "active" | "inactive";

interface ThemeExtensionState {
  cartBlock: ExtensionStatus;
  cartEmbed: ExtensionStatus;
}

async function detectThemeExtensions(): Promise<ThemeExtensionState> {
  const fallback: ThemeExtensionState = {
    cartBlock: "unknown",
    cartEmbed: "unknown",
  };
  try {
    const shopifyGlobal = (
      globalThis as {
        shopify?: { app?: { extensions?: () => Promise<unknown> } };
      }
    ).shopify;
    if (!shopifyGlobal?.app?.extensions) return fallback;
    const result = await shopifyGlobal.app.extensions();
    const list = Array.isArray(result)
      ? result
      : ((result as { data?: unknown[] } | null)?.data ?? []);
    const statusOf = (handleFragment: string): ExtensionStatus => {
      const match = list.find((item) => {
        const handle = String(
          (item as { handle?: string; type?: string })?.handle ??
            (item as { type?: string })?.type ??
            "",
        );
        return handle.includes(handleFragment);
      });
      if (!match) return "inactive";
      const activations = (match as { activations?: { status?: string }[] })
        .activations;
      const active = activations?.some((a) => a.status === "active");
      if (active) return "active";
      const topStatus = (match as { status?: string }).status;
      if (topStatus === "active") return "active";
      if (topStatus === "available" || topStatus === "inactive") return "inactive";
      return "inactive";
    };
    return {
      cartBlock: statusOf("cart-delivery"),
      cartEmbed: statusOf("cart-drawer"),
    };
  } catch {
    return fallback;
  }
}

function statusLabel(status: ExtensionStatus): string {
  switch (status) {
    case "active":
      return "有効";
    case "inactive":
      return "未設置";
    default:
      return "未確認（アプリを埋め込み管理画面で開くと検出します）";
  }
}

export default function Index() {
  const [extensions, setExtensions] = useState<ThemeExtensionState>({
    cartBlock: "unknown",
    cartEmbed: "unknown",
  });

  useEffect(() => {
    let cancelled = false;
    detectThemeExtensions().then((state) => {
      if (!cancelled) setExtensions(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <s-page heading="配達日時指定 — セットアップ">
      <s-banner tone="warning" heading="Buy Now / エクスプレス決済について">
        「今すぐ購入」や Shop Pay などのエクスプレス決済はカートを経由しません。
        これらの注文では配達希望日が保存されず、送り状CSVでは「日時指定なし」になります。
        テーマのダイナミックチェックアウトボタンを非表示にすると、通常のカート経由に誘導できます。
      </s-banner>

      <s-section heading="このアプリでできること">
        <s-paragraph>
          カートで配達希望日・時間帯を選び、ヤマト B2クラウド / 佐川 e-飛伝III /
          ゆうプリR 向けの送り状CSVを書き出します。Plus プランは不要です。
        </s-paragraph>
      </s-section>

      <s-section heading="セットアップ（3ステップ）">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-heading>
              1. カートページにアプリブロックを追加
            </s-heading>
            <s-paragraph>
              ステータス: {statusLabel(extensions.cartBlock)}
            </s-paragraph>
            <s-paragraph>
              テーマエディタ → カート → アプリブロック「配達日時指定」を追加してください。
              OS 2.0 のセクションに対応しています。テーマの Liquid は編集しません。
            </s-paragraph>

            <s-heading>
              2. カートドロワー用アプリ埋め込みを有効化
            </s-heading>
            <s-paragraph>
              ステータス: {statusLabel(extensions.cartEmbed)}
            </s-paragraph>
            <s-paragraph>
              テーマ設定 → アプリ埋め込み で「カートドロワー用 配達日時指定」をオンにします。
              Dawn 向けのセレクタプリセットがあります。ドロワーの CSS セレクタは埋め込み設定で変更できます。
            </s-paragraph>

            <s-heading>3. カレンダーと送り主を設定</s-heading>
            <s-paragraph>
              <s-link href="/app/settings">設定</s-link>
              で休業日・年始（12/29–1/3）・カットオフ時刻・リードタイム・都道府県日数・送り主を保存します。
              保存後、カートの日付候補に反映されます。
            </s-paragraph>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="次の画面">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/orders">送り状CSV</s-link>
            — 未出力・要確認・日時指定なしで絞り込み、キャリア別にダウンロード
          </s-list-item>
          <s-list-item>
            <s-link href="/app/settings">設定</s-link>
            — カレンダー、リードタイム、地域日数、送り主、CSV 設定
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
