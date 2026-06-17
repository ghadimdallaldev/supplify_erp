import i18n from 'i18next'
import { DEFAULT_LOCALE } from './config'

export function getFormatLocale(): string | undefined {
  const lang = i18n.language?.split('-')[0] || DEFAULT_LOCALE
  return lang === 'ar' ? 'ar' : undefined
}

export function formatDate(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(getFormatLocale(), options).format(date)
}

export function formatDateTime(value: Date | string | number): string {
  return formatDate(value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatPercent(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(getFormatLocale(), {
    style: 'percent',
    maximumFractionDigits,
  }).format(value)
}
