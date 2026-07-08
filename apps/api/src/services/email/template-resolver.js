import { renderTemplate } from './templates/registry.js'

const CATEGORY_TEMPLATE_MAP = {
  placed: 'order.placed',
  acknowledged: 'order.acknowledged',
  processing: 'order.processing',
  shipped: 'order.shipped',
  delivered: 'order.delivered',
  completed: 'order.completed',
  cancelled: 'order.cancelled',
  order_new: 'order.placed',
  orders: 'order.placed',
  message_received: 'chat.message',
  invoice_issued: 'invoice.issued',
  invoice_overdue: 'invoice.overdue',
  payment_received: 'payment.received',
  low_stock: 'inventory.low_stock',
  inventory_alerts: 'inventory.low_stock',
  inventory_expiring: 'inventory.expiring',
  inventory_expired: 'inventory.expired',
  reorder_cadence_missed: 'reorder.cadence',
  order_fulfillment_issue: 'order.fulfillment_issue',
  out_of_stock: 'inventory.out_of_stock',
  system_updates: 'notification.generic',
  welcome: 'auth.welcome',
  admin_new_tenant: 'admin.new_tenant',
  promotions: 'deal.approved',
  reservation_created: 'reservation.new',
  reservation_rescheduled: 'reservation.rescheduled',
  reservation_cancelled: 'reservation.cancelled',
  reservation_waitlist: 'reservation.waitlist',
  order_approval: 'order.placed',
  order_amendment: 'order.substitution',
  amendment: 'order.substitution',
  staff_pto: 'staff.pto',
  staff_swap: 'staff.swap',
  staff_clock: 'staff.shift',
  staff_announcement: 'staff.announcement',
  staff_document: 'staff.document',
  scheduled_order: 'order.scheduled',
  dispute_opened: 'dispute.opened',
  dispute_resolved: 'dispute.resolved',
  dispute_rejected: 'dispute.resolved',
  dispute_updated: 'dispute.updated',
  billing_trial_started: 'billing.trial_started',
  billing_trial_ending: 'billing.trial_ending',
  billing_trial_expired: 'billing.trial_expired',
  billing_activated: 'billing.activated',
  billing_renewed: 'billing.renewed',
  billing_payment_failed: 'billing.payment_failed',
  billing_cancelled: 'billing.cancelled',
  billing_plan_changed: 'billing.plan_changed',
  billing_trial_extended: 'billing.trial_extended',
  billing_account_locked: 'billing.account_locked',
  deal_submitted: 'deal.submitted',
  deal_approved: 'deal.approved',
  deal_rejected: 'deal.rejected',
  deal_expired: 'deal.expired',
  supplier_connection_request: 'supplier.access_request',
  connection_request_accepted: 'growth.connection_accepted',
  connection_request_declined: 'growth.connection_declined',
  referral_registered: 'growth.referral_registered',
  referral_reward_earned: 'growth.referral_reward',
  sponsorship_gift_received: 'growth.sponsorship_gift',
  sponsorship_expired: 'growth.sponsorship_expired',
  test: 'auth.test',
}

const NOTIFICATION_TYPE_TEMPLATE_MAP = {
  supplier_connection_request: 'supplier.access_request',
  connection_request_accepted: 'growth.connection_accepted',
  connection_request_declined: 'growth.connection_declined',
  referral_registered: 'growth.referral_registered',
  referral_reward_earned: 'growth.referral_reward',
  sponsorship_gift_received: 'growth.sponsorship_gift',
  sponsorship_expired: 'growth.sponsorship_expired',
}

export function resolveNotificationTemplate(notificationCategory, notificationType) {
  const cat = String(notificationCategory || '').toLowerCase()
  if (CATEGORY_TEMPLATE_MAP[cat]) return CATEGORY_TEMPLATE_MAP[cat]

  const type = String(notificationType || '').toLowerCase()
  if (NOTIFICATION_TYPE_TEMPLATE_MAP[type]) return NOTIFICATION_TYPE_TEMPLATE_MAP[type]
  if (type.includes('order')) return 'order.placed'
  if (type.includes('invoice')) return 'invoice.issued'
  if (type.includes('dispute')) return 'dispute.opened'
  if (type.includes('reservation')) return 'reservation.new'
  if (type.includes('staff')) return 'staff.shift'
  if (type.includes('billing')) return 'billing.activated'
  if (type.includes('deal')) return 'deal.approved'
  if (type.includes('referral') || type.includes('sponsorship') || type.includes('connection')) {
    return 'notification.generic'
  }

  return 'notification.generic'
}

export function buildNotificationEventKey({
  notificationCategory,
  referenceType,
  referenceId,
  userId,
  tenantId,
}) {
  return [
    notificationCategory || 'notify',
    referenceType || 'none',
    referenceId || 'none',
    userId || 'none',
    tenantId || 'none',
  ].join(':')
}

export { renderTemplate }
