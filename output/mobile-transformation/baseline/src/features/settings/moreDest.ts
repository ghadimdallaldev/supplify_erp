import type { IoniconName } from '../../components/ui'

export type MoreDest = {
  title: string
  icon?: IoniconName
  screen?: string
  tab?: string
  webPath?: string
}

export function destPreview(items: MoreDest[], max = 3): string {
  const names = items.map((item) => item.title)
  if (names.length <= max) return names.join(' · ')
  return `${names.slice(0, max).join(' · ')} +${names.length - max}`
}
