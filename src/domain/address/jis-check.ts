export interface JisIssue {
  char: string;
  index: number;
  suggestion?: string;
}

/**
 * Characters outside JIS X 0208 (髙, 﨑, ①, emoji) produce an issue.
 * Substitutions are applied only when the merchant confirms — never silently.
 * Scaffold heuristic: non-BMP code points plus a known gaiji set.
 */
export function jisCheck(
  value: string,
  substitutions: ReadonlyMap<string, string>,
): JisIssue[] {
  const issues: JisIssue[] = [];
  let index = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0xffff || "髙﨑①".includes(char)) {
      issues.push({
        char,
        index,
        suggestion: substitutions.get(char),
      });
    }
    index += char.length;
  }
  return issues;
}
