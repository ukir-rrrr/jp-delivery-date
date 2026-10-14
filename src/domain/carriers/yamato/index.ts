import { formatSlashDate, type LocalDate } from "../../calendar/local-date";
import type { Slot } from "../../delivery/slot";
import type {
  CarrierAdapter,
  ColumnSpec,
  Issue,
  Result,
  Row,
} from "../adapter";

/** Yamato B2 Cloud slot codes. Spec PDF not re-read this week — treat as scaffold. */
const SLOT_MAP: Record<Slot, string> = {
  unspecified: "",
  morning: "0812",
  afternoon_early: "1416",
  afternoon_late: "1618",
  evening: "1820",
  night: "1921",
};

const COLUMNS: ColumnSpec[] = [
  { order: 1, label: "お客様管理番号", maxBytes: 20, required: false },
  { order: 2, label: "送り状種類", maxBytes: 2, required: true },
];

export const yamatoAdapter: CarrierAdapter = {
  id: "yamato",
  columns: COLUMNS,
  encoding: "shift_jis",
  mapSlot(s: Slot) {
    return SLOT_MAP[s];
  },
  formatDate(d: LocalDate) {
    return formatSlashDate(d);
  },
  toRow(): Result<Row, Issue[]> {
    return {
      ok: false,
      error: [
        {
          code: "not_implemented",
          message: "Yamato B2 adapter lands in W4",
        },
      ],
    };
  },
};
