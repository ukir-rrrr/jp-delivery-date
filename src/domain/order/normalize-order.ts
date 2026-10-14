import type { LocalDate } from "../calendar/local-date";
import type { NoteAttribute } from "./parse-note-attributes";
import { parseDeliveryChoice } from "./parse-note-attributes";
import type { NormalizedOrder } from "./normalized-order";

export interface ShippingSnapshot {
  name: string | null;
  phone: string | null;
  postalCode: string | null;
  province: string | null;
  city: string | null;
  address1: string | null;
  address2: string | null;
}

export interface DeliveryOrderInput {
  orderId: string;
  orderName: string;
  contactPhone: string | null;
  shipping: ShippingSnapshot | null;
  attributes: readonly NoteAttribute[];
  lineItems: readonly string[];
  lineItemsTruncated: boolean;
  shipDate: LocalDate;
}

export function normalizeDeliveryOrder(input: DeliveryOrderInput): NormalizedOrder {
  const choice = parseDeliveryChoice(input.attributes);
  const shipping = input.shipping;
  const pcdRedacted = shipping != null && isRedacted(shipping) && input.contactPhone == null;
  const text = (value: string | null | undefined) => value ?? "";
  return {
    orderId: input.orderId,
    orderName: input.orderName,
    name: text(shipping?.name),
    phone: text(shipping?.phone ?? input.contactPhone),
    address: {
      postalCode: text(shipping?.postalCode),
      province: text(shipping?.province),
      city: text(shipping?.city),
      address1: text(shipping?.address1),
      address2: text(shipping?.address2),
    },
    deliveryDate: choice.date,
    slot: choice.slot,
    shipDate: input.shipDate,
    lineItems: input.lineItems,
    lineItemsTruncated: input.lineItemsTruncated,
    missingDeliveryPreference: choice.missing,
    pcdRedacted,
    needsReview: pcdRedacted || choice.date === null,
  };
}

function isRedacted(shipping: ShippingSnapshot): boolean {
  return [
    shipping.name,
    shipping.phone,
    shipping.postalCode,
    shipping.province,
    shipping.city,
    shipping.address1,
    shipping.address2,
  ].every((value) => value == null);
}
