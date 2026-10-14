import { useEffect } from "react";
import { useNavigation } from "react-router";

export function useAdminLoading(): boolean {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  useEffect(() => {
    if (typeof shopify === "undefined") return;
    shopify.loading(busy);
    return () => {
      shopify.loading(false);
    };
  }, [busy]);
  return busy;
}

export function useSavedToast(
  result: { ok: boolean } | undefined,
  message: string,
): void {
  useEffect(() => {
    if (!result?.ok || typeof shopify === "undefined") return;
    shopify.toast.show(message);
  }, [result, message]);
}
