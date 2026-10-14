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
  name: string;
  phone: string;
  address: NormalizedAddress;
  deliveryDate: LocalDate | null;
  slot: Slot;
  /** Buy Now / express checkout: cart attributes were never written. */
  missingDeliveryPreference: boolean;
  /** PCD fields came back redacted (HTTP 200 with nulls). */
  pcdRedacted: boolean;
  needsReview: boolean;
}
