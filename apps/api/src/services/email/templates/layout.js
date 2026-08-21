import { t, resolveLocale, getLanguageDirection } from '../../../i18n/index.js'

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

/**
 * Large OTP code block for auth emails.
 * @param {string} code
 * @param {{ expiryText?: string, reassuranceText?: string }} [opts]
 */
export function renderOtpCode(code, { expiryText, reassuranceText } = {}) {
  if (code == null || String(code).trim() === '') return ''
  const safe = escapeHtml(code)
  return `<div style="margin:24px 0;text-align:center;">
  <div style="display:inline-block;background:#ede9fe;border-radius:12px;padding:20px 28px;">
    <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.28em;color:#5b21b6;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safe}</p>
  </div>
  ${
    expiryText
      ? `<p style="margin:12px 0 0;font-size:14px;color:#64748b;">${escapeHtml(expiryText)}</p>`
      : ''
  }
  ${
    reassuranceText
      ? `<p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">${escapeHtml(reassuranceText)}</p>`
      : ''
  }
</div>`
}

/**
 * Optional key/value detail strip. Omits entirely when no valid rows.
 * @param {Array<{ label?: string, value?: string }>} [rows]
 */
export function renderDetailStrip(rows = []) {
  const valid = (rows || []).filter(
    (r) => r && String(r.label || '').trim() && String(r.value || '').trim()
  )
  if (!valid.length) return ''
  const cells = valid
    .map(
      (r) => `<tr>
      <td style="padding:8px 0;font-size:13px;color:#64748b;width:40%;">${escapeHtml(r.label)}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(r.value)}</td>
    </tr>`
    )
    .join('')
  return `<table role="presentation" style="width:100%;margin:20px 0;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">${cells}</table>`
}

/**
 * Base HTML layout for Supplify transactional emails (Stripe-like shell).
 */
export function renderEmailLayout({
  title,
  bodyHtml,
  bodyText,
  ctaUrl,
  ctaLabel,
  tenantName,
  previewText,
  locale = 'en',
  code = '',
  codeBlockHtml = '',
  detailStripHtml = '',
}) {
  const lng = resolveLocale(locale)
  const dir = getLanguageDirection(lng)
  const brand = t('emails.layout.brand', lng)
  const resolvedTitle = title || t('emails.layout.defaultTitle', lng)
  const greeting = tenantName
    ? `<p style="margin:0 0 16px;color:#334155;">${t('emails.layout.forTenant', lng, { tenantName: escapeHtml(tenantName) })}</p>`
    : ''
  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<p style="margin:28px 0 0;">
    <a href="${escapeAttr(ctaUrl)}" style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px;">${escapeHtml(ctaLabel)}</a>
  </p>`
      : ''
  const footer = t('emails.layout.footer', lng)
  const textAlign = dir === 'rtl' ? 'right' : 'left'
  const preheader = previewText
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}</div>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="${lng}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(resolvedTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT_STACK};line-height:1.6;color:#0f172a;direction:${dir};text-align:${textAlign};">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;">
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
              <p style="margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#5b21b6;">${escapeHtml(brand)}</p>
              <h1 style="margin:0 0 20px;font-size:24px;font-weight:600;line-height:1.3;color:#0f172a;">${escapeHtml(resolvedTitle)}</h1>
              ${greeting}
              <div style="font-size:16px;color:#334155;">${bodyHtml || `<p>${escapeHtml(bodyText || '')}</p>`}</div>
              ${codeBlockHtml || ''}
              ${detailStripHtml || ''}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;font-size:12px;color:#94a3b8;text-align:center;">
              ${escapeHtml(footer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const textParts = [
    resolvedTitle,
    tenantName ? `(${tenantName})` : '',
    '',
    bodyText || stripHtml(bodyHtml),
    '',
  ]
  if (code && String(code).trim()) {
    textParts.push(String(code).trim(), '')
  }
  if (ctaUrl) {
    textParts.push(`${ctaLabel || t('emails.layout.open', lng)}: ${ctaUrl}`, '')
  }
  textParts.push(t('emails.layout.automatedSignoff', lng))
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
