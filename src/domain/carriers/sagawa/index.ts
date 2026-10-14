import { formatCompactDate, type LocalDate } from "../../calendar/local-date";
import type { Slot } from "../../delivery/slot";
import type {
  CarrierAdapter,
  ColumnSpec,
  Issue,
  Result,
  Row,
} from "../adapter";

/** Sagawa e-Hiden III slot codes. Map each code from the PDF only (W5). */
const SLOT_MAP: Record<Slot, string> = {
  unspecified: "",
  morning: "01",
  afternoon_early: "12",
  afternoon_late: "14",
  evening: "16",
  night: "18",
};

const COLUMNS: ColumnSpec[] = [
  { order: 1, label: "出荷日", maxBytes: 8, required: true },
];

export const sagawaAdapter: CarrierAdapter = {
  id: "sagawa",
  columns: COLUMNS,
  encoding: "shift_jis",
  mapSlot(s: Slot) {
    return SLOT_MAP[s];
  },
  formatDate(d: LocalDate) {
    return formatCompactDate(d);
  },
  toRow(): Result<Row, Issue[]> {
    return {
      ok: false,
      error: [
        {
          code: "not_implemented",
          message: "Sagawa e-Hiden III adapter lands in W5",
        },
      ],
    };
  },
};
