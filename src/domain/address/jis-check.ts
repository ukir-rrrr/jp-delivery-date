export interface JisIssue {
  char: string;
  index: number;
  suggestion?: string;
}

/**
 * Characters outside JIS X 0208 (髙, 﨑, ①, emoji) produce an issue.
 * Substitutions are applied only when the merchant confirms — never silently.
 */
export function jisCheck(
  value: string,
  substitutions: ReadonlyMap<string, string>,
): JisIssue[] {
  const issues: JisIssue[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    const code = char.codePointAt(0) ?? 0;
    // Scaffold heuristic: flag non-BMP and a small known gaiji set.
    if (code > 0xffff || "髙﨑①".includes(char)) {
      issues.push({
        char,
        index: i,
        suggestion: substitutions.get(char),
      });
    }
  }
  return issues;
}
