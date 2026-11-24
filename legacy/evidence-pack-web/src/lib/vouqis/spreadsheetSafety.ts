// Guards against CSV/spreadsheet formula injection (OWASP "CSV Injection"):
// a PR title or author name is attacker-influenced (it comes from whoever
// opened the PR), and a value like "=cmd|'/c calc'!A1" pasted into a CSV cell
// can execute when a reviewer opens it in Excel. Values that already carry an
// explicit cell type (numbers, our own enum strings, URLs) don't need this.

const DANGEROUS_LEADING_CHARS = ["=", "+", "-", "@", "\t", "\r"];

export function sanitizeForSpreadsheet(value: string): string {
  if (DANGEROUS_LEADING_CHARS.some((char) => value.startsWith(char))) {
    return `'${value}`;
  }
  return value;
}
