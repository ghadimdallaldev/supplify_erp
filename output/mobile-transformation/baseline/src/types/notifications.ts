export interface NotificationPreferences {
  emailEnabled: boolean
  whatsappEnabled: boolean
  pushEnabled: boolean
  inAppEnabled: boolean
  notifyOrderNew: boolean
  notifyOrderAcknowledged: boolean
  notifyOrderProcessing: boolean
  notifyOrderShipped: boolean
  notifyOrderDelivered: boolean
  notifyOrderCancelled: boolean
  notifyMessageReceived: boolean
  notifyInvoiceIssued: boolean
  notifyInvoiceOverdue: boolean
  notifyPaymentReceived: boolean
  notifyLowStock: boolean
  notifyOutOfStock: boolean
  notifyBilling: boolean
  notifyPromotions: boolean
  [key: string]: boolean
}
