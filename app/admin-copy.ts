export type AdminLoadReason = "unavailable" | "access_denied" | "bad_cursor";

export function adminLoadMessage(
  reason: AdminLoadReason,
  subject: "settings" | "products" | "orders",
): string {
  switch (reason) {
    case "access_denied":
      return subject === "orders"
        ? "注文を見る権限がありません。アプリの権限を更新してください。"
        : "商品を保存する権限がありません。アプリの権限を更新してください。";
    case "bad_cursor":
      return "ページ指定が不正です。";
    default:
      if (subject === "settings") {
        return "設定を読み込めませんでした。しばらくしてからもう一度開いてください。";
      }
      if (subject === "orders") {
        return "注文を読み込めませんでした。しばらくしてからもう一度開いてください。";
      }
      return "商品を読み込めませんでした。しばらくしてからもう一度開いてください。";
  }
}

export const INVALID_SETTINGS_MESSAGE =
  "保存済みの設定を読み取れません。この画面の内容を保存すると置き換わります。";
