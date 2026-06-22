import { t, resolveLocale } from '../../../i18n/index.js'
import { renderEmailLayout, textToBodyHtml } from './layout.js'

function emailKey(templateId, field) {
  const [group, ...rest] = templateId.split('.')
  if (rest.length === 0) return `emails.${group}.${field}`
  return `emails.${group}.${rest.join('.')}.${field}`
}

function standardTemplate({
  subject,
  title,
  message,
  ctaUrl,
  ctaLabel,
  tenantName,
  data = {},
  locale = 'en',
}) {
  const lng = resolveLocale(locale)
  const body = data.bodyHtml || textToBodyHtml(message)
  const { html, text } = renderEmailLayout({
    locale: lng,
    title: title || subject,
    bodyHtml: body,
    bodyText: message,
    ctaUrl: data.ctaUrl || ctaUrl,
    ctaLabel: data.ctaLabel || ctaLabel,
    tenantName: data.tenantName || tenantName,
  })
  return { subject, html, text }
}

function register(map, id, fn) {
  map[id] = fn
}

/** @type {Record<string, (data: object, locale?: string) => { subject: string, html: string, text: string }>} */
export const TEMPLATE_REGISTRY = {}

register(TEMPLATE_REGISTRY, 'auth.welcome', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  const messageKey =
    d.tenantType === 'SUPPLIER'
      ? 'emails.auth.welcome.messageSupplier'
      : 'emails.auth.welcome.messageRestaurant'
  return standardTemplate({
    subject: t('emails.auth.welcome.subject', lng),
    title: t('emails.auth.welcome.title', lng),
    message: d.message || t(messageKey, lng),
    ctaUrl: d.ctaUrl,
    ctaLabel: t('emails.cta.openSupplify', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'auth.team_invite', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: d.subject || t('emails.auth.team_invite.subject', lng),
    title: t('emails.auth.team_invite.title', lng),
    message:
      d.message ||
      t('emails.auth.team_invite.message', lng, {
        tenantName: d.tenantName || t('notifications.common.aTeam', lng),
      }),
    ctaUrl: d.inviteUrl || d.ctaUrl,
    ctaLabel: t('emails.cta.acceptInvitation', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'auth.password_changed', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  const defaultMessage = d.temporaryPassword
    ? t('emails.auth.password_changed.messageTemporary', lng, {
        temporaryPassword: d.temporaryPassword,
      })
    : t('emails.auth.password_changed.messageChanged', lng)
  return standardTemplate({
    subject: t('emails.auth.password_changed.subject', lng),
    title: t('emails.auth.password_changed.title', lng),
    message: d.message || defaultMessage,
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'auth.role_changed', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: t('emails.auth.role_changed.subject', lng),
    title: t('emails.auth.role_changed.title', lng),
    message:
      d.message ||
      t('emails.auth.role_changed.message', lng, {
        tenantName: d.tenantName || t('notifications.common.aTeam', lng),
      }),
    ctaUrl: d.ctaUrl,
    ctaLabel: t('emails.cta.openSupplify', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'auth.test', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: t('emails.auth.test.subject', lng),
    title: t('emails.auth.test.title', lng),
    message: d.message || t('emails.auth.test.message', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

const orderStatuses = [
  'placed',
  'acknowledged',
  'processing',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'received',
  'scheduled',
  'substitution',
  'fulfillment_issue',
]
for (const status of orderStatuses) {
  const id = `order.${status}`
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: d.subject || t(emailKey(id, 'subject'), lng),
      title: d.title || t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl,
      ctaLabel: t('emails.cta.viewOrder', lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

register(TEMPLATE_REGISTRY, 'chat.message', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: d.subject || t('emails.chat.message.subject', lng),
    title: t('emails.chat.message.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/chat',
    ctaLabel: t('emails.cta.openChat', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'invoice.issued', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject:
      d.subject ||
      t('emails.invoice.issued.subject', lng, {
        invoiceNumber: d.invoiceNumber || '',
      }).trim(),
    title: t('emails.invoice.issued.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/invoices',
    ctaLabel: t('emails.cta.viewInvoice', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'invoice.overdue', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: d.subject || t('emails.invoice.overdue.subject', lng),
    title: t('emails.invoice.overdue.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/invoices',
    ctaLabel: t('emails.cta.viewInvoice', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'payment.received', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: d.subject || t('emails.payment.received.subject', lng),
    title: t('emails.payment.received.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/invoices',
    ctaLabel: t('emails.cta.viewDetails', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

const disputeIds = ['opened', 'resolved', 'updated']
for (const status of disputeIds) {
  const id = `dispute.${status}`
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: d.subject || t(emailKey(id, 'subject'), lng),
      title: d.title || t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl,
      ctaLabel: t('emails.cta.viewDispute', lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

const dealTemplates = [
  'submitted',
  'approved',
  'rejected',
  'payment_required',
  'activated',
  'expired',
  'performance',
]
for (const status of dealTemplates) {
  const id = `deal.${status}`
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: d.subject || t(emailKey(id, 'subject'), lng),
      title: t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl || '/app/promotions',
      ctaLabel: t('emails.cta.viewDeals', lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

const billingTemplates = [
  'trial_started',
  'trial_ending',
  'trial_expired',
  'activated',
  'renewed',
  'payment_failed',
  'cancelled',
  'plan_changed',
  'trial_extended',
  'account_locked',
]
for (const status of billingTemplates) {
  const id = `billing.${status}`
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: d.subject || t(emailKey(id, 'subject'), lng),
      title: t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl || '/app/billing',
      ctaLabel: t('emails.cta.manageBilling', lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

const inventoryTemplates = ['low_stock', 'out_of_stock', 'expiring', 'expired']
for (const status of inventoryTemplates) {
  const id = `inventory.${status}`
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: t(emailKey(id, 'subject'), lng),
      title: t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl || '/app/inventory',
      ctaLabel: t('emails.cta.viewInventory', lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

register(TEMPLATE_REGISTRY, 'reorder.cadence', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: t('emails.reorder.cadence.subject', lng),
    title: t('emails.reorder.cadence.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/orders',
    ctaLabel: t('emails.cta.placeOrder', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

const reservationTemplates = [
  'confirmation',
  'cancelled',
  'rescheduled',
  'new',
  'waitlist',
  'waitlist_offer',
]
for (const status of reservationTemplates) {
  const id = `reservation.${status}`
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: d.subject || t(emailKey(id, 'subject'), lng),
      title: t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl,
      ctaLabel: d.ctaLabel || t('emails.cta.viewReservation', lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

const staffTemplates = {
  'staff.magic_link': 'openStaffPortal',
  'staff.invite': 'openPortal',
  'staff.shift': 'openPortal',
  'staff.swap': 'openPortal',
  'staff.pto': 'openPortal',
  'staff.announcement': 'openPortal',
  'staff.document': 'openPortal',
}
for (const [id, ctaKey] of Object.entries(staffTemplates)) {
  register(TEMPLATE_REGISTRY, id, (d, locale = 'en') => {
    const lng = resolveLocale(locale)
    return standardTemplate({
      subject: d.subject || t(emailKey(id, 'subject'), lng),
      title: t(emailKey(id, 'title'), lng),
      message: d.message,
      ctaUrl: d.ctaUrl || d.loginUrl,
      ctaLabel: d.ctaLabel || t(`emails.cta.${ctaKey}`, lng),
      tenantName: d.tenantName,
      data: d,
      locale: lng,
    })
  })
}

register(TEMPLATE_REGISTRY, 'admin.new_tenant', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  const tenantTypeLabel =
    d.tenantType === 'SUPPLIER'
      ? t('notifications.admin.tenantTypeSupplier', lng)
      : t('notifications.admin.tenantTypeRestaurant', lng)
  return standardTemplate({
    subject:
      d.subject ||
      t('emails.admin.new_tenant.subject', lng, {
        tenantType: tenantTypeLabel,
      }),
    title: t('emails.admin.new_tenant.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/admin',
    ctaLabel: t('emails.cta.openAdmin', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'admin.deal_review', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: t('emails.admin.deal_review.subject', lng),
    title: t('emails.admin.deal_review.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl || '/admin/promotions',
    ctaLabel: t('emails.cta.reviewDeal', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'supplier.access_request', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: t('emails.supplier.access_request.subject', lng),
    title: t('emails.supplier.access_request.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl,
    ctaLabel: t('emails.cta.reviewRequest', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'notification.generic', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: d.subject || d.title || t('emails.notification.generic.subject', lng),
    title: d.title || t('emails.notification.generic.title', lng),
    message: d.message,
    ctaUrl: d.ctaUrl,
    ctaLabel: d.ctaLabel || t('emails.cta.openSupplify', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

register(TEMPLATE_REGISTRY, 'notification.digest', (d, locale = 'en') => {
  const lng = resolveLocale(locale)
  return standardTemplate({
    subject: d.subject || t('emails.notification.digest.subject', lng),
    title: d.title || t('emails.notification.digest.title', lng),
    message: d.items ? `${d.message || ''}\n\n${d.items}` : d.message,
    ctaUrl: d.ctaUrl || '/app/notifications',
    ctaLabel: t('emails.cta.viewNotifications', lng),
    tenantName: d.tenantName,
    data: d,
    locale: lng,
  })
})

export function renderTemplate(templateId, data = {}, locale = 'en') {
  const lng = resolveLocale(data.locale || locale)
  const fn = TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY['notification.generic']
  const rendered = fn(data, lng)
  return {
    subject: rendered.subject || data.subject || t('emails.layout.brand', lng),
    html: rendered.html,
    text: rendered.text,
  }
}

export function listTemplateIds() {
  return Object.keys(TEMPLATE_REGISTRY).sort()
}
