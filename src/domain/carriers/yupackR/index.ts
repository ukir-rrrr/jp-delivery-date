import { formatCompactDate } from "../../calendar/local-date";
import { defineAdapter } from "../adapter";
import { YUPACK_COLUMNS, YUPACK_SLOT_CODES } from "./columns";
import { yupackPreview, yupackRow } from "./map-row";

export { YUPACK_COLUMNS, YUPACK_R_SPEC, YUPACK_SLOT_CODES, YUPACK_TIME_SLOTS, yupackColumn, yupackHeader } from "./columns";
export { yupackPreview, yupackRow } from "./map-row";

/**
 * Yu-Print R import CSV. The merchant maps these headers in the import filter.
 * Shift_JIS is one of the encodings the filter accepts. encodingVerified is
 * false because UTF-8 is also documented.
 */
export const yupackRAdapter = defineAdapter({
  id: "yupackR",
  columns: YUPACK_COLUMNS,
  encoding: "shift_jis",
  encodingVerified: false,
  mapSlot(slot) {
    return YUPACK_SLOT_CODES[slot];
  },
  formatDate(date) {
    return formatCompactDate(date);
  },
  mapRow: yupackRow,
  preview: yupackPreview,
});
