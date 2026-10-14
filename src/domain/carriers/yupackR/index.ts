import { formatSlashDate, type LocalDate } from "../../calendar/local-date";
import type {
  CarrierAdapter,
  ColumnSpec,
  Issue,
  Result,
  Row,
} from "../adapter";

const COLUMNS: ColumnSpec[] = [
  { order: 1, label: "お届け希望日", maxBytes: 10, required: false },
];

export const yupackRAdapter: CarrierAdapter = {
  id: "yupackR",
  columns: COLUMNS,
  encoding: "utf8_bom",
  mapSlot() {
    return {
      code: "unmapped",
      message: "Yu-Print R slot mapping happens on the import side",
    };
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
          message: "Yu-Print R adapter lands in W5–6",
        },
      ],
    };
  },
};
