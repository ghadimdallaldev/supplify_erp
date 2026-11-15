import en from './locales/en.json'
import ar from './locales/ar.json'
import { isRtl } from '../../i18n'

export function assistantText(key: string, values: Record<string, string | number> = {}): string {
  let value: unknown = isRtl() ? ar : en
  for (const part of key.split('.')) value = value && typeof value === 'object' ? (value as Record<string,unknown>)[part] : undefined
  return String(value ?? key).replace(/{{(\w+)}}/g, (match, name: string) => String(values[name] ?? match))
}
