import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { carrierById } from "@domain/carriers";

/**
 * Resource route: streams a shipping-label CSV. Customer name/address/phone
 * are fetched per request and never persisted. Access log is a W5–6 duty.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const carrier = carrierById(params.carrier ?? "");
  if (!carrier) {
    return new Response("unknown carrier", { status: 404 });
  }

  return new Response(
    `${carrier.id} CSV export is not implemented yet (adapter lands in W4–6)\n`,
    {
      status: 501,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
};
