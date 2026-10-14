import { classifySaveError } from "@infra/graphql/admin";

const ACCESS_DENIED =
  "商品を保存する権限がありません。アプリの権限を更新してください。";
const RETRY = "Shopify に保存できませんでした。しばらくしてからもう一度お試しください。";

export function metafieldSaveFailure(error: unknown): {
  ok: false;
  formError: string;
  fieldErrors: Record<string, string>;
} {
  const failure = classifySaveError(error);
  if (failure.kind === "user_error") {
    return { ok: false, formError: failure.message, fieldErrors: {} };
  }
  return {
    ok: false,
    formError: failure.kind === "access_denied" ? ACCESS_DENIED : RETRY,
    fieldErrors: {},
  };
}
