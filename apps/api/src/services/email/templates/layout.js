/**
 * Base HTML layout for Supplify transactional emails.
 */
export function renderEmailLayout({
  title,
  bodyHtml,
  bodyText,
  ctaUrl,
  ctaLabel,
  tenantName,
  previewText,
}) {
  const greeting = tenantName
    ? `<p style="margin:0 0 16px;color:#334155;">For ${escapeHtml(tenantName)}</p>`
    : ''
  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<p style="margin:28px 0;">
    <a href="${escapeAttr(ctaUrl)}" style="background:#0f172a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;">${escapeHtml(ctaLabel)}</a>
  </p>`
      : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title || 'Supplify')}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#0f172a;">
  <div style="max-width:560px;margin:32px auto;padding:0 16px;">
    <div style="background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
      <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#64748b;">Supplify</p>
      <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;color:#0f172a;">${escapeHtml(title || 'Notification')}</h1>
      ${greeting}
      <div style="font-size:16px;color:#334155;">${bodyHtml || `<p>${escapeHtml(bodyText || '')}</p>`}</div>
      ${ctaBlock}
    </div>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
      This is an automated email from Supplify. Please do not reply to this message.
    </p>
  </div>
</body>
</html>`

  const textParts = [
    title,
    tenantName ? `(${tenantName})` : '',
    '',
    bodyText || stripHtml(bodyHtml),
    '',
  ]
  if (ctaUrl) textParts.push(`${ctaLabel || 'Open'}: ${ctaUrl}`, '')
  textParts.push('— Supplify (automated message)')
  const text = textParts
    .filter((line, i, arr) => line !== '' || (i > 0 && arr[i - 1] !== ''))
    .join('\n')

  return { html, text: previewText ? `${previewText}\n\n${text}` : text }
}

export function escapeHtml(value) {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function stripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Simple message body from plain text with line breaks. */
export function textToBodyHtml(message) {
  if (!message) return '<p></p>'
  return `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`
}
