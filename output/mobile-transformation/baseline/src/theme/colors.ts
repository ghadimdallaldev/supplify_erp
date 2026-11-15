export const colors = {
  // Supplify violet brand, matching the web --primary. Role-neutral semantic names.
  brand: '#5822B4',
  brandDark: '#451A8F',
  brandDeep: '#2B1259',
  brandLight: '#F1ECFB',
  brandBorder: '#D9CCF3',
  accent: '#8B5CF6',

  background: '#F7F8FA',
  backgroundAlt: '#EEF1F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceRaised: '#FFFFFF',

  text: '#152033',
  textMuted: '#5D6B82',
  textFaint: '#66758C',
  onBrand: '#FFFFFF',
  onBrandMuted: 'rgba(255,255,255,0.8)',
  onBrandSubtle: 'rgba(255,255,255,0.62)',

  backdropDark: 'rgba(15, 35, 65, 0.48)',
  border: '#E3E8EF',
  borderStrong: '#C9D3E1',
  separator: '#E8EDF3',

  success: '#087A4B',
  successBg: '#E9F8F0',
  successBorder: '#B7E8CB',
  warning: '#A85B05',
  warningBg: '#FFF6E5',
  warningBorder: '#F7D79B',
  danger: '#C33831',
  dangerBg: '#FFF0EF',
  dangerBorder: '#F5C4C1',
  info: '#1769AA',
  infoBg: '#EAF4FD',
  infoBorder: '#BEDCF5',
  neutralBg: '#F1F4F8',
  neutralBorder: '#DCE3EC',
} as const

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'
export type StatusDomain = 'generic' | 'order' | 'delivery' | 'invoice' | 'fulfillment' | 'dispute'

const STATUS_TONES: Record<StatusDomain, Record<string, StatusTone>> = {
  order: {
    PLACED: 'warning', ACKNOWLEDGED: 'info', PROCESSING: 'info', SHIPPED: 'info',
    DELIVERED: 'success', RECEIVED: 'success', COMPLETED: 'success',
    CANCELLED: 'danger', CANCELED: 'danger', REJECTED: 'danger',
  },
  delivery: {
    ASSIGNED: 'warning', PICKED_UP: 'info', OUT_FOR_DELIVERY: 'info',
    DELIVERED: 'success', FAILED: 'danger', RESCHEDULED: 'warning',
  },
  invoice: {
    DRAFT: 'neutral', ISSUED: 'info', SENT: 'info', PENDING: 'warning',
    OVERDUE: 'danger', PAID: 'success', VOID: 'neutral',
  },
  fulfillment: {
    PENDING: 'warning', PICKING: 'info', PACKING: 'info', READY: 'brand',
    DISPATCHED: 'info', DELIVERED: 'success', FAILED: 'danger', EXCEPTION: 'danger',
  },
  dispute: {
    OPEN: 'warning', PENDING: 'warning', UNDER_REVIEW: 'info', RESOLVED: 'success',
    REJECTED: 'danger', CLOSED: 'neutral',
  },
  generic: {},
}

export function statusToneFor(
  status: string | null | undefined,
  domain: StatusDomain = 'generic'
): StatusTone {
  const key = String(status ?? '').toUpperCase()
  const direct = STATUS_TONES[domain][key]
  if (direct) return direct
  if (domain !== 'generic') return statusToneFor(key, 'generic')
  if (['COMPLETED', 'DELIVERED', 'PAID', 'ACTIVE', 'RECEIVED', 'RESOLVED'].includes(key)) return 'success'
  if (['PROCESSING', 'ACKNOWLEDGED', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKING', 'PACKING'].includes(key)) return 'info'
  if (['PLACED', 'PENDING', 'AWAITING', 'DRAFT', 'ASSIGNED', 'RESCHEDULED'].includes(key)) return 'warning'
  if (['CANCELLED', 'CANCELED', 'FAILED', 'REJECTED', 'EXCEPTION', 'OVERDUE'].includes(key)) return 'danger'
  return 'neutral'
}

/** Backwards-compatible generic mapping. Prefer statusToneFor with a domain. */
export function statusTone(status: string | null | undefined): StatusTone {
  return statusToneFor(status, 'generic')
}

export function statusColors(tone: StatusTone) {
  switch (tone) {
    case 'success': return { fg: colors.success, bg: colors.successBg, border: colors.successBorder }
    case 'warning': return { fg: colors.warning, bg: colors.warningBg, border: colors.warningBorder }
    case 'danger': return { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder }
    case 'info': return { fg: colors.info, bg: colors.infoBg, border: colors.infoBorder }
    case 'brand': return { fg: colors.brandDark, bg: colors.brandLight, border: colors.brandBorder }
    default: return { fg: colors.textMuted, bg: colors.neutralBg, border: colors.neutralBorder }
  }
}

export function prettyStatus(status: string | null | undefined): string {
  return String(status ?? 'UNKNOWN')
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
