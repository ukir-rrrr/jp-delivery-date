export type AdminLoadReason = "unavailable" | "access_denied" | "bad_cursor";

export function adminLoadMessage(
  reason: AdminLoadReason,
  subject: "settings" | "products",
): string {
  switch (reason) {
    case "access_denied":
      return "商品を保存する権限がありません。アプリの権限を更新してください。";
    case "bad_cursor":
      return "ページ指定が不正です。";
    default:
      return subject === "settings"
        ? "設定を読み込めませんでした。しばらくしてからもう一度開いてください。"
        : "商品を読み込めませんでした。しばらくしてからもう一度開いてください。";
  }
}

export const INVALID_SETTINGS_MESSAGE =
  "保存済みの設定を読み取れません。この画面の内容を保存すると置き換わります。";
