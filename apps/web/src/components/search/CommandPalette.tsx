import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, Truck, Users, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'

const NAV_ITEMS = [
  {
    labelKey: 'dashboard',
    href: '/app/dashboard',
    icon: LayoutDashboard,
    keywordsKey: 'dashboard',
  },
  { labelKey: 'products', href: '/app/products', icon: Package, keywordsKey: 'products' },
  { labelKey: 'orders', href: '/app/orders', icon: ShoppingCart, keywordsKey: 'orders' },
  { labelKey: 'fulfillment', href: '/app/fulfillment', icon: Truck, keywordsKey: 'fulfillment' },
  { labelKey: 'staff', href: '/app/staff', icon: Users, keywordsKey: 'staff' },
  { labelKey: 'settings', href: '/app/settings', icon: Settings, keywordsKey: 'settings' },
] as const

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('navigation')

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  const runCommand = useCallback(
    (href: string) => {
      onOpenChange(false)
      navigate(href)
    },
    [navigate, onOpenChange]
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t('command.searchPages')} />
      <CommandList>
        <CommandEmpty>{t('command.noResults')}</CommandEmpty>
        <CommandGroup heading={t('command.navigate')}>
          {NAV_ITEMS.map(({ labelKey, href, icon: Icon, keywordsKey }) => {
            const label = t(labelKey)
            const keywords = t(`command.keywords.${keywordsKey}`)

            return (
              <CommandItem
                key={href}
                value={`${label} ${keywords}`}
                onSelect={() => runCommand(href)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
