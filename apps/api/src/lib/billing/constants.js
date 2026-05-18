/** Days after failed payment before account is locked */
export const GRACE_PERIOD_DAYS = 7

/** New signups stay locked until paid checkout or admin activation */
export const LOCK_REASON_PENDING_ACTIVATION = 'pending_activation'

export const BILLING_PROVIDERS = ['stub', 'manual', 'stripe', 'wish_money', 'bank_transfer']

export const PAYMENT_METHOD_TYPES = ['CARD', 'BANK_ACCOUNT', 'WALLET', 'MANUAL']
