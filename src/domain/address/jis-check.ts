import { isJisX0208OrX0201 } from "../encoding/jis";

export interface JisIssue {
  char: string;
  index: number;
  suggestion?: string;
}

/**
 * Characters outside JIS X 0208 level 1/2 (and JIS X 0201, which the carrier
 * layouts allow as 半角) produce an issue. Substitutions are suggestions
 * only — callers must not apply them unless the merchant confirms.
 */
export function jisCheck(
  value: string,
  substitutions: ReadonlyMap<string, string>,
): JisIssue[] {
  const issues: JisIssue[] = [];
  let index = 0;
  for (const char of value) {
    if (!isJisX0208OrX0201(char)) {
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
