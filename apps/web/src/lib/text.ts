/** ASCII separator — avoids em-dash mojibake (â€") in Windows/Edge locales. */
export const TEXT_SEP = ' - '

export function sepJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(TEXT_SEP)
}
