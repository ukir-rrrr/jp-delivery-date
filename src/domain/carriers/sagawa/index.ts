import { formatCompactDate } from "../../calendar/local-date";
import { defineAdapter } from "../adapter";
import { SAGAWA_COLUMNS, SAGAWA_SLOT_CODES } from "./columns";
import { sagawaPreview, sagawaRow } from "./map-row";

export { SAGAWA_COLUMNS, SAGAWA_EHIDEN_SPEC, SAGAWA_SLOT_CODES, SAGAWA_TIME_SLOTS, sagawaColumn, sagawaHeader } from "./columns";
export { sagawaPreview, sagawaRow } from "./map-row";

/**
 * e飛伝III 標準_飛脚宅配便_CSV_ヘッダ有.
 * Import encoding is not named in the manual (see SAGAWA_EHIDEN_SPEC), so
 * this adapter writes Shift_JIS and leaves encodingVerified false.
 */
export const sagawaAdapter = defineAdapter({
  id: "sagawa",
  columns: SAGAWA_COLUMNS,
  encoding: "shift_jis",
  encodingVerified: false,
  mapSlot(slot) {
    return SAGAWA_SLOT_CODES[slot];
  },
  formatDate(date) {
    return formatCompactDate(date);
  },
  mapRow: sagawaRow,
  preview: sagawaPreview,
});
