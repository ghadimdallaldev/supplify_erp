/** Build and download a CSV file from rows of string/number values. */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>
) {
  const esc = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return `"${s.replace(/"/g, '""')}"`
  }
  const lines = [headers.map(esc).join(','), ...rows.map((row) => row.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Flatten report API rows for CSV export. */
export function reportRowsToCsv(
  data: Array<Record<string, unknown>>,
  columns: Array<{ key: string; label: string }>
) {
  return data.map((row) => columns.map((col) => row[col.key] as string | number | null | undefined))
}
