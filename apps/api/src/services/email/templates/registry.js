import { renderEmailLayout, textToBodyHtml } from './layout.js'

function standardTemplate({ subject, title, message, ctaUrl, ctaLabel, tenantName, data = {} }) {
  const body = data.bodyHtml || textToBodyHtml(message)
  const { html, text } = renderEmailLayout({
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

/** @type {Record<string, (data: object) => { subject: string, html: string, text: string }>} */
export const TEMPLATE_REGISTRY = {}

register(TEMPLATE_REGISTRY, 'auth.welcome', (d) =>
  standardTemplate({
    subject: 'Welcome to Supplify',
    title: 'Welcome to Supplify',
    message:
      d.message ||
      `Your ${d.tenantType === 'SUPPLIER' ? 'supplier' : 'restaurant'} account is ready.`,
    ctaUrl: d.ctaUrl,
    ctaLabel: 'Open Supplify',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'auth.team_invite', (d) =>
  standardTemplate({
    subject: d.subject || 'You are invited to join Supplify',
    title: 'Team invitation',
    message:
      d.message ||
      `You have been invited to join ${d.tenantName || 'a team'} on Supplify. Use the link below to accept.`,
    ctaUrl: d.inviteUrl || d.ctaUrl,
    ctaLabel: 'Accept invitation',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'auth.password_changed', (d) =>
  standardTemplate({
    subject: 'Your Supplify password was reset',
    title: 'Password reset',
    message:
      d.message ||
      (d.temporaryPassword
        ? `A temporary password was set for your account: ${d.temporaryPassword}\n\nSign in and change it immediately.`
        : 'Your account password was changed. If you did not request this, contact your administrator.'),
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'auth.role_changed', (d) =>
  standardTemplate({
    subject: 'Your Supplify permissions were updated',
    title: 'Role updated',
    message:
      d.message || `Your role or permissions on ${d.tenantName || 'your account'} were updated.`,
    ctaUrl: d.ctaUrl,
    ctaLabel: 'Open Supplify',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'auth.test', (d) =>
  standardTemplate({
    subject: 'Supplify email test',
    title: 'Email test',
    message: d.message || 'If you received this, Supplify email delivery is working.',
    tenantName: d.tenantName,
    data: d,
  })
)

const orderStatuses = {
  'order.placed': { subject: 'New order', title: 'Order placed' },
  'order.acknowledged': { subject: 'Order acknowledged', title: 'Order acknowledged' },
  'order.processing': { subject: 'Order processing', title: 'Order in progress' },
  'order.shipped': { subject: 'Order shipped', title: 'Order dispatched' },
  'order.delivered': { subject: 'Order delivered', title: 'Order delivered' },
  'order.completed': { subject: 'Order completed', title: 'Order completed' },
  'order.cancelled': { subject: 'Order cancelled', title: 'Order cancelled' },
  'order.received': { subject: 'Delivery received', title: 'Order received' },
  'order.scheduled': { subject: 'Scheduled order update', title: 'Scheduled order' },
  'order.substitution': { subject: 'Order substitution', title: 'Substitution proposal' },
  'order.fulfillment_issue': { subject: 'Order fulfillment update', title: 'Fulfillment issue' },
}
for (const [id, meta] of Object.entries(orderStatuses)) {
  register(TEMPLATE_REGISTRY, id, (d) =>
    standardTemplate({
      subject: d.subject || meta.subject,
      title: d.title || meta.title,
      message: d.message,
      ctaUrl: d.ctaUrl,
      ctaLabel: 'View order',
      tenantName: d.tenantName,
      data: d,
    })
  )
}

register(TEMPLATE_REGISTRY, 'chat.message', (d) =>
  standardTemplate({
    subject: d.subject || 'New message',
    title: 'New message',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/chat',
    ctaLabel: 'Open chat',
    tenantName: d.tenantName,
    data: d,
  })
)

register(TEMPLATE_REGISTRY, 'invoice.issued', (d) =>
  standardTemplate({
    subject: d.subject || `Invoice ${d.invoiceNumber || ''} issued`.trim(),
    title: 'Invoice issued',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/invoices',
    ctaLabel: 'View invoice',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'invoice.overdue', (d) =>
  standardTemplate({
    subject: d.subject || 'Invoice overdue',
    title: 'Invoice overdue',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/invoices',
    ctaLabel: 'View invoice',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'payment.received', (d) =>
  standardTemplate({
    subject: d.subject || 'Payment received',
    title: 'Payment received',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/invoices',
    ctaLabel: 'View details',
    tenantName: d.tenantName,
    data: d,
  })
)

const disputeIds = ['dispute.opened', 'dispute.resolved', 'dispute.updated']
for (const id of disputeIds) {
  register(TEMPLATE_REGISTRY, id, (d) =>
    standardTemplate({
      subject: d.subject || id.replace('dispute.', 'Dispute '),
      title: d.title || 'Dispute update',
      message: d.message,
      ctaUrl: d.ctaUrl,
      ctaLabel: 'View dispute',
      tenantName: d.tenantName,
      data: d,
    })
  )
}

const dealTemplates = {
  'deal.submitted': { subject: 'Deal submitted for review', title: 'Deal pending approval' },
  'deal.approved': { subject: 'Deal approved', title: 'Deal approved' },
  'deal.rejected': { subject: 'Deal rejected', title: 'Deal rejected' },
  'deal.payment_required': { subject: 'Deal payment required', title: 'Payment required' },
  'deal.activated': { subject: 'Deal activated', title: 'Deal is live' },
  'deal.expired': { subject: 'Deal expired', title: 'Deal expired' },
  'deal.performance': { subject: 'Deal performance summary', title: 'Deal insights' },
}
for (const [id, meta] of Object.entries(dealTemplates)) {
  register(TEMPLATE_REGISTRY, id, (d) =>
    standardTemplate({
      subject: d.subject || meta.subject,
      title: meta.title,
      message: d.message,
      ctaUrl: d.ctaUrl || '/app/promotions',
      ctaLabel: 'View deals',
      tenantName: d.tenantName,
      data: d,
    })
  )
}

const billingTemplates = {
  'billing.trial_started': { subject: 'Trial started', title: 'Welcome to your trial' },
  'billing.trial_ending': { subject: 'Trial ending soon', title: 'Trial ending soon' },
  'billing.trial_expired': { subject: 'Trial expired', title: 'Trial expired' },
  'billing.activated': { subject: 'Subscription activated', title: 'Subscription active' },
  'billing.renewed': { subject: 'Subscription renewed', title: 'Subscription renewed' },
  'billing.payment_failed': { subject: 'Payment failed', title: 'Payment failed' },
  'billing.cancelled': { subject: 'Subscription cancelled', title: 'Subscription cancelled' },
  'billing.plan_changed': { subject: 'Plan updated', title: 'Plan changed' },
  'billing.trial_extended': { subject: 'Trial extended', title: 'Trial extended' },
  'billing.account_locked': { subject: 'Account restricted', title: 'Write access restricted' },
}
for (const [id, meta] of Object.entries(billingTemplates)) {
  register(TEMPLATE_REGISTRY, id, (d) =>
    standardTemplate({
      subject: d.subject || meta.subject,
      title: meta.title,
      message: d.message,
      ctaUrl: d.ctaUrl || '/app/billing',
      ctaLabel: 'Manage billing',
      tenantName: d.tenantName,
      data: d,
    })
  )
}

register(TEMPLATE_REGISTRY, 'inventory.low_stock', (d) =>
  standardTemplate({
    subject: 'Low stock alert',
    title: 'Low stock',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/inventory',
    ctaLabel: 'View inventory',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'inventory.out_of_stock', (d) =>
  standardTemplate({
    subject: 'Out of stock',
    title: 'Out of stock',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/inventory',
    ctaLabel: 'View inventory',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'inventory.expiring', (d) =>
  standardTemplate({
    subject: 'Items expiring soon',
    title: 'Expiry reminder',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/inventory',
    ctaLabel: 'View inventory',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'inventory.expired', (d) =>
  standardTemplate({
    subject: 'Expired inventory',
    title: 'Expired items',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/inventory',
    ctaLabel: 'View inventory',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'reorder.cadence', (d) =>
  standardTemplate({
    subject: 'Reorder reminder',
    title: 'Smart reorder reminder',
    message: d.message,
    ctaUrl: d.ctaUrl || '/app/orders',
    ctaLabel: 'Place order',
    tenantName: d.tenantName,
    data: d,
  })
)

const reservationTemplates = {
  'reservation.confirmation': { subject: 'Reservation confirmed', title: 'Reservation confirmed' },
  'reservation.cancelled': { subject: 'Reservation cancelled', title: 'Reservation cancelled' },
  'reservation.rescheduled': { subject: 'Reservation rescheduled', title: 'Reservation updated' },
  'reservation.new': { subject: 'New reservation', title: 'New reservation' },
  'reservation.waitlist': { subject: 'Waitlist update', title: 'Waitlist update' },
  'reservation.waitlist_offer': { subject: 'Table available', title: 'Waitlist offer' },
}
for (const [id, meta] of Object.entries(reservationTemplates)) {
  register(TEMPLATE_REGISTRY, id, (d) =>
    standardTemplate({
      subject: d.subject || meta.subject,
      title: meta.title,
      message: d.message,
      ctaUrl: d.ctaUrl,
      ctaLabel: d.ctaLabel || 'View reservation',
      tenantName: d.tenantName,
      data: d,
    })
  )
}

const staffTemplates = {
  'staff.magic_link': {
    subject: 'Your Supplify staff portal sign-in link',
    title: 'Staff portal sign-in',
  },
  'staff.invite': { subject: 'Your Supplify staff portal account', title: 'Staff portal access' },
  'staff.shift': { subject: 'Shift update', title: 'Shift assigned' },
  'staff.swap': { subject: 'Shift swap request', title: 'Shift swap' },
  'staff.pto': { subject: 'PTO request', title: 'Time off request' },
  'staff.announcement': { subject: 'Team announcement', title: 'Announcement' },
  'staff.document': { subject: 'New document', title: 'Document uploaded' },
}
for (const [id, meta] of Object.entries(staffTemplates)) {
  register(TEMPLATE_REGISTRY, id, (d) =>
    standardTemplate({
      subject: d.subject || meta.subject,
      title: meta.title,
      message: d.message,
      ctaUrl: d.ctaUrl || d.loginUrl,
      ctaLabel: d.ctaLabel || (id === 'staff.magic_link' ? 'Open staff portal' : 'Open portal'),
      tenantName: d.tenantName,
      data: d,
    })
  )
}

register(TEMPLATE_REGISTRY, 'admin.new_tenant', (d) =>
  standardTemplate({
    subject: d.subject || `New ${d.tenantType || 'tenant'} registered`,
    title: 'New registration',
    message: d.message,
    ctaUrl: d.ctaUrl || '/admin',
    ctaLabel: 'Open admin',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'admin.deal_review', (d) =>
  standardTemplate({
    subject: 'Deal requires approval',
    title: 'Deal review needed',
    message: d.message,
    ctaUrl: d.ctaUrl || '/admin/promotions',
    ctaLabel: 'Review deal',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'supplier.access_request', (d) =>
  standardTemplate({
    subject: 'Restaurant access request',
    title: 'New access request',
    message: d.message,
    ctaUrl: d.ctaUrl,
    ctaLabel: 'Review request',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'notification.generic', (d) =>
  standardTemplate({
    subject: d.subject || d.title || 'Supplify notification',
    title: d.title || 'Notification',
    message: d.message,
    ctaUrl: d.ctaUrl,
    ctaLabel: d.ctaLabel || 'Open Supplify',
    tenantName: d.tenantName,
    data: d,
  })
)
register(TEMPLATE_REGISTRY, 'notification.digest', (d) =>
  standardTemplate({
    subject: d.subject || 'Your Supplify digest',
    title: d.title || 'Your notification digest',
    message: d.items ? `${d.message || ''}\n\n${d.items}` : d.message,
    ctaUrl: d.ctaUrl || '/app/notifications',
    ctaLabel: 'View notifications',
    tenantName: d.tenantName,
    data: d,
  })
)

export function renderTemplate(templateId, data = {}) {
  const fn = TEMPLATE_REGISTRY[templateId] || TEMPLATE_REGISTRY['notification.generic']
  const rendered = fn(data)
  return {
    subject: rendered.subject || data.subject || 'Supplify',
    html: rendered.html,
    text: rendered.text,
  }
}

export function listTemplateIds() {
  return Object.keys(TEMPLATE_REGISTRY).sort()
}
