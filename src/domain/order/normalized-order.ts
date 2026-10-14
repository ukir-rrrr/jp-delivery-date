import type { LocalDate } from "../calendar/local-date";
import type { Slot } from "../delivery/slot";

export interface NormalizedAddress {
  postalCode: string;
  province: string;
  city: string;
  address1: string;
  address2: string;
}

export interface NormalizedOrder {
  orderId: string;
  /** Merchant-facing order name such as #1001. Not customer PII. */
  orderName: string;
  name: string;
  phone: string;
  address: NormalizedAddress;
  deliveryDate: LocalDate | null;
  slot: Slot;
  /** JST date printed as 出荷予定日. Chosen at export time and not stored. */
  shipDate: LocalDate | null;
  /** Product titles. Not customer PII. */
  lineItems: readonly string[];
  lineItemsTruncated: boolean;
  /** Buy Now / express checkout: cart attributes were never written. */
  missingDeliveryPreference: boolean;
  /** PCD fields came back redacted (HTTP 200 with nulls). */
  pcdRedacted: boolean;
  needsReview: boolean;
}
