import { formatSlashDate } from "../../calendar/local-date";
import type { SettingsV1 } from "../../delivery/settings";
import type { NormalizedOrder } from "../../order/normalized-order";
import { defineAdapter, type Result } from "../adapter";
import { buildLabelFile, type LabelFailure } from "../label-file";
import { YAMATO_COLUMNS, YAMATO_SLOT_CODES } from "./columns";
import { yamatoPreview, yamatoRow } from "./map-row";

export { YAMATO_B2_SPEC, YAMATO_COLUMNS, yamatoColumn, yamatoHeader } from "./columns";
export { yamatoPreview, yamatoRow } from "./map-row";

/**
 * B2 Cloud label CSV.
 * Encoding: the layout PDF does not name one (see YAMATO_B2_SPEC). Shift_JIS
 * is used so a character outside JIS level 1/2 cannot be written by CP932.
 * encodingVerified is false until a real B2 import confirms the bytes.
 */
export const yamatoAdapter = defineAdapter({
  id: "yamato",
  columns: YAMATO_COLUMNS,
  encoding: "shift_jis",
  encodingVerified: false,
  mapSlot(slot) {
    return YAMATO_SLOT_CODES[slot];
  },
  formatDate(date) {
    return formatSlashDate(date);
  },
  mapRow: yamatoRow,
  preview: yamatoPreview,
});

export type YamatoFailure = LabelFailure;

export function buildYamatoFile(
  orders: readonly NormalizedOrder[],
  settings: SettingsV1,
): Result<Uint8Array, YamatoFailure[]> {
  return buildLabelFile(yamatoAdapter, orders, settings);
}
