/** RFC 4180 CSV with CRLF. Quote when needed. */
export function serializeCsv(rows: readonly (readonly string[])[]): string {
  const lines = rows.map((row) =>
    row.map(escapeField).join(","),
  );
  return `${lines.join("\r\n")}\r\n`;
}

function escapeField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}
