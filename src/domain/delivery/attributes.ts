/** Cart attributes written by the storefront and read back from the order. */
export const ATTR_DATE_LABEL = "配達希望日";
export const ATTR_SLOT_LABEL = "配達時間帯";
export const ATTR_DATE_KEY = "_delivery_date";
export const ATTR_SLOT_KEY = "_delivery_slot";
export const ATTR_VERSION_KEY = "_delivery_v";

export const DELIVERY_ATTRIBUTE_KEYS = [
  ATTR_DATE_LABEL,
  ATTR_SLOT_LABEL,
  ATTR_DATE_KEY,
  ATTR_SLOT_KEY,
  ATTR_VERSION_KEY,
] as const;
