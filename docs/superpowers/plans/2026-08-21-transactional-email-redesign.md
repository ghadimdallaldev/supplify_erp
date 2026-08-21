# Transactional Email Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Stripe-like transactional email shell with OTP hero, optional detail strips, and polished EN/AR copy for high-traffic templates.

**Architecture:** Extend `layout.js` with brand shell + helpers (`renderOtpCode`, `renderDetailStrip`); wire high-traffic entries in `registry.js`; rewrite copy in `en/emails.json` and `ar/emails.json`. No MJML; no caller rewrites unless fields are already available unused.

**Tech Stack:** Node/Express email pipeline, Vitest, i18next-style `t()` keys in `emails.json`, inline HTML for email clients.

**Spec:** `docs/superpowers/specs/2026-08-21-transactional-email-design.md`

## Global Constraints

- Visual: page `#f8fafc`, wordmark `#5b21b6`, CTA `#7c3aed`, body `#334155`, OTP box `#ede9fe`
- Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- OTP templates: no CTA button; code hero required
- Detail strip: omit entirely when no rows; never empty labels
- High-traffic copy only: auth welcome/invite/OTP/password_changed; orders placed/shipped/delivered/cancelled; invoices issued/overdue; billing trial_started/ending/expired, activated, payment_failed
- Arabic: matching polish for the same set
- Mobile: skip + parity log entry
- Do not introduce MJML / React Email / per-family full HTML duplication

## File map

| File                                                     | Responsibility                                    |
| -------------------------------------------------------- | ------------------------------------------------- |
| `apps/api/src/services/email/templates/layout.js`        | Shell, OTP hero, detail strip, escape helpers     |
| `apps/api/src/services/email/templates/registry.js`      | Wire templates to helpers + map payload → details |
| `apps/api/src/i18n/locales/en/emails.json`               | EN copy + strip/OTP labels                        |
| `apps/api/src/i18n/locales/ar/emails.json`               | AR copy + strip/OTP labels                        |
| `apps/api/src/services/email/templates/layout.test.js`   | Layout helper unit tests                          |
| `apps/api/src/services/email/templates/registry.test.js` | Registry integration assertions                   |
| `docs/mobile/MOBILE_FEATURE_PARITY.md`                   | Dated skip                                        |
| `docs/operations/email-system.md`                        | Note on layout helpers                            |

---

### Task 1: Layout shell + helpers (TDD)

**Files:**

- Create: `apps/api/src/services/email/templates/layout.test.js`
- Modify: `apps/api/src/services/email/templates/layout.js`

**Interfaces:**

- Produces:
  - `renderOtpCode(code, { expiryText, reassuranceText }) → string` (HTML)
  - `renderDetailStrip(rows: Array<{ label: string, value: string }>) → string` (empty string if no valid rows)
  - `renderEmailLayout({ title, bodyHtml, bodyText, ctaUrl, ctaLabel, tenantName, previewText, locale, codeBlockHtml?, detailStripHtml? }) → { html, text }`

- [ ] **Step 1: Write failing layout tests**

```js
import { describe, expect, it } from 'vitest'
import { renderEmailLayout, renderOtpCode, renderDetailStrip } from './layout.js'

describe('email layout helpers', () => {
  it('uses violet brand wordmark and CTA (not slate generic)', () => {
    const { html } = renderEmailLayout({
      title: 'Hello',
      bodyHtml: '<p>Body</p>',
      ctaUrl: 'https://app.example/app',
      ctaLabel: 'Open',
      locale: 'en',
    })
    expect(html).toContain('#5b21b6')
    expect(html).toContain('#7c3aed')
    expect(html).toContain('#f8fafc')
    expect(html).not.toMatch(/text-transform:uppercase;color:#64748b/)
  })

  it('renders OTP code hero with pale violet box', () => {
    const block = renderOtpCode('482193', {
      expiryText: 'Expires in 10 minutes',
      reassuranceText: 'If you did not request this, ignore this email.',
    })
    expect(block).toContain('482193')
    expect(block).toContain('#ede9fe')
    expect(block).toContain('Expires in 10 minutes')
  })

  it('omits detail strip when rows empty', () => {
    expect(renderDetailStrip([])).toBe('')
    expect(renderDetailStrip([{ label: 'Order', value: '' }])).toBe('')
  })

  it('renders detail strip rows when values present', () => {
    const html = renderDetailStrip([
      { label: 'Order', value: '#4821' },
      { label: 'Total', value: '$120.00' },
    ])
    expect(html).toContain('Order')
    expect(html).toContain('#4821')
    expect(html).toContain('$120.00')
  })

  it('sets rtl dir for Arabic locale', () => {
    const { html } = renderEmailLayout({
      title: 'مرحبا',
      bodyHtml: '<p>نص</p>',
      locale: 'ar',
    })
    expect(html).toMatch(/dir="rtl"/)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/api && pnpm exec vitest run src/services/email/templates/layout.test.js`
Expected: FAIL (missing exports / old styles)

- [ ] **Step 3: Implement layout.js**

Replace shell colors/typography per Global Constraints. Add:

```js
export function renderOtpCode(code, { expiryText, reassuranceText } = {}) {
  const safe = escapeHtml(code)
  return `<div style="margin:24px 0;text-align:center;">
  <div style="display:inline-block;background:#ede9fe;border-radius:12px;padding:20px 28px;">
    <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.28em;color:#5b21b6;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${safe}</p>
  </div>
  ${expiryText ? `<p style="margin:12px 0 0;font-size:14px;color:#64748b;">${escapeHtml(expiryText)}</p>` : ''}
  ${reassuranceText ? `<p style="margin:8px 0 0;font-size:13px;color:#94a3b8;">${escapeHtml(reassuranceText)}</p>` : ''}
</div>`
}

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
```

Update `renderEmailLayout` to:

- Brand color `#5b21b6` (no uppercase muted label)
- Background `#f8fafc`, CTA `#7c3aed`
- Accept `codeBlockHtml` and `detailStripHtml` and insert after body
- Optional preheader div (hidden) when `previewText` set
- Prefer simple table wrapper for Outlook safety around the card

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/api && pnpm exec vitest run src/services/email/templates/layout.test.js`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/email/templates/layout.js apps/api/src/services/email/templates/layout.test.js
git commit -m "feat(email): restyle transactional layout with OTP and detail helpers"
```

---

### Task 2: i18n copy + strip labels (EN + AR)

**Files:**

- Modify: `apps/api/src/i18n/locales/en/emails.json`
- Modify: `apps/api/src/i18n/locales/ar/emails.json`

**Interfaces:**

- Produces keys under `emails.layout.*`, `emails.details.*`, `emails.otp.*`, plus rewritten high-traffic subjects/titles/messages

- [ ] **Step 1: Add shared labels to EN**

Under `layout` keep brand; update footer to calmer wording if needed. Add:

```json
"details": {
  "order": "Order",
  "status": "Status",
  "total": "Total",
  "invoice": "Invoice",
  "amount": "Amount",
  "due": "Due",
  "plan": "Plan",
  "team": "Team",
  "role": "Role"
},
"otp": {
  "expiry": "Expires in 10 minutes",
  "reassurance": "If you did not request this code, you can safely ignore this email."
}
```

Rewrite high-traffic strings to be specific and calm, e.g.:

- welcome restaurant: "Your restaurant workspace is ready. Sign in to place orders and manage suppliers."
- team_invite title: "You're invited"
- order.placed subject: "New order{{orderSuffix}}" pattern only if interpolation already used — otherwise keep subject keys and improve titles/messages; prefer `{{orderId}}` only where callers already pass it into subject via `d.subject`
- For subjects that are static today, polish wording without breaking callers that override `d.subject` / `d.message`

OTP messages: body should NOT repeat the raw code as the only presentation — message becomes intro like "Use this code to finish signing in:" and code goes via hero. Keep `{{code}}` out of HTML body when hero is used; plain-text path still includes code via layout text assembly.

- [ ] **Step 2: Mirror AR**

Same key structure; natural Arabic, not literal calque. Brand remains `سبلايفاي`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/i18n/locales/en/emails.json apps/api/src/i18n/locales/ar/emails.json
git commit -m "feat(email): polish high-traffic EN and AR transactional copy"
```

---

### Task 3: Wire registry (OTP + detail strips)

**Files:**

- Modify: `apps/api/src/services/email/templates/registry.js`
- Modify: `apps/api/src/services/email/templates/registry.test.js`

**Interfaces:**

- Consumes: `renderOtpCode`, `renderDetailStrip`, `renderEmailLayout` from layout.js
- Produces: OTP templates with hero; order/invoice/billing/invite with optional strips

- [ ] **Step 1: Extend registry tests**

```js
it('renders OTP with code hero and no CTA button color block required', async () => {
  const { renderTemplate } = await import('./registry.js')
  const rendered = renderTemplate('auth.email_otp_login', { code: '123456' })
  expect(rendered.html).toContain('123456')
  expect(rendered.html).toContain('#ede9fe')
  expect(rendered.text).toContain('123456')
})

it('includes order detail strip when order fields present', async () => {
  const { renderTemplate } = await import('./registry.js')
  const rendered = renderTemplate('order.placed', {
    message: 'A new order arrived.',
    orderId: 'ORD-9',
    status: 'Placed',
    amount: '$42.00',
    ctaUrl: '/app/orders/ORD-9',
  })
  expect(rendered.html).toContain('ORD-9')
  expect(rendered.html).toContain('#7c3aed')
})

it('omits detail strip when no structured fields', async () => {
  const { renderTemplate } = await import('./registry.js')
  const rendered = renderTemplate('order.placed', {
    message: 'A new order arrived.',
  })
  expect(rendered.html).not.toContain('border-top:1px solid #e2e8f0')
})
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api && pnpm exec vitest run src/services/email/templates/registry.test.js`

- [ ] **Step 3: Implement registry wiring**

1. Import `renderOtpCode`, `renderDetailStrip` (and keep `renderEmailLayout` / `textToBodyHtml`).
2. Extend `standardTemplate` to accept `details` array and/or `code`; when `code` set, build OTP body without duplicating code in paragraph (intro message only) and pass `codeBlockHtml`; when `details` set, pass `detailStripHtml`.
3. OTP registrations:

```js
register(TEMPLATE_REGISTRY, 'auth.email_otp_login', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: t('emails.auth.email_otp_login.subject', lng),
    title: t('emails.auth.email_otp_login.title', lng),
    message: t('emails.auth.email_otp_login.message', lng), // no {{code}} in HTML path
    code: d.code,
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})
```

Same for `auth.email_otp_verify`.

4. Helper `buildDetailRows(lng, specs)` where specs are `{ key, labelKey, value }` filtered.
5. For `auth.team_invite`, add details Team/Role from `tenantName` / `roleName` or `role`.
6. For order templates in the loop, if `d.orderId|d.orderNumber`, `d.status|d.statusLabel`, `d.amount|d.total` present → strip.
7. Invoice issued/overdue: `invoiceNumber`, `amount`, `dueDate`.
8. Billing high-traffic: `planName`, status-ish from title or `d.status`.

Ensure plain-text for OTP still includes code (append in standardTemplate text path when `code` present).

- [ ] **Step 4: Run tests — PASS**

Run: `cd apps/api && pnpm exec vitest run src/services/email/templates/`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/email/templates/registry.js apps/api/src/services/email/templates/registry.test.js
git commit -m "feat(email): wire OTP hero and detail strips in template registry"
```

---

### Task 4: Docs + verification

**Files:**

- Modify: `docs/mobile/MOBILE_FEATURE_PARITY.md`
- Modify: `docs/operations/email-system.md`

- [ ] **Step 1: Parity skip entry (top of file, dated 2026-08-21)**

```markdown
## 2026-08-21 — Transactional email redesign (API-only)

Stripe-like shared email layout, OTP code hero, optional detail strips, and EN/AR copy polish for high-traffic templates (`layout.js` / `registry.js` / `emails.json`).

- **Mobile:** skipped — emails are server-rendered by the API; no mobile client contract change.
```

- [ ] **Step 2: Email system doc**

Add a short "Layout" subsection noting shared shell, OTP hero, detail strips, and brand colors.

- [ ] **Step 3: Full email test pass**

Run: `cd apps/api && pnpm exec vitest run src/services/email/`

- [ ] **Step 4: Commit**

```bash
git add docs/mobile/MOBILE_FEATURE_PARITY.md docs/operations/email-system.md
git commit -m "docs(email): record layout redesign and mobile parity skip"
```

---

## Spec coverage checklist

| Spec requirement                    | Task             |
| ----------------------------------- | ---------------- |
| Stripe-like shell colors/typography | 1                |
| OTP hero + no CTA                   | 1, 3             |
| Detail strip omit-when-empty        | 1, 3             |
| EN/AR high-traffic copy             | 2                |
| Registry wiring                     | 3                |
| Tests OTP / strip / RTL / CTA       | 1, 3             |
| Mobile parity skip                  | 4                |
| No MJML                             | honored globally |
