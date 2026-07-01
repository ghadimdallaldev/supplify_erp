import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Gift,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Truck,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '../../hooks/usePermissions'
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
    anyOf: ['ORDERS_VIEW', 'INVOICES_VIEW'] as const,
  },
  {
    labelKey: 'products',
    href: '/app/products',
    icon: Package,
    keywordsKey: 'products',
    permission: 'CATALOG_VIEW' as const,
  },
  {
    labelKey: 'orders',
    href: '/app/orders',
    icon: ShoppingCart,
    keywordsKey: 'orders',
    permission: 'ORDERS_VIEW' as const,
  },
  {
    labelKey: 'fulfillment',
    href: '/app/fulfillment',
    icon: Truck,
    keywordsKey: 'fulfillment',
    permission: 'FULFILLMENT_VIEW' as const,
  },
  {
    labelKey: 'reservations',
    href: '/app/reservations',
    icon: CalendarDays,
    keywordsKey: 'reservations',
    permission: 'RESERVATIONS_VIEW' as const,
  },
  {
    labelKey: 'staff',
    href: '/app/staff',
    icon: Users,
    keywordsKey: 'staff',
    permission: 'STAFF_VIEW' as const,
  },
  {
    labelKey: 'guestMenu',
    href: '/app/consumer-menu',
    icon: UtensilsCrossed,
    keywordsKey: 'guestMenu',
    permission: 'CATALOG_VIEW' as const,
  },
  {
    labelKey: 'guestOrders',
    href: '/app/consumer-orders',
    icon: ShoppingBasket,
    keywordsKey: 'guestOrders',
    permission: 'ORDERS_VIEW' as const,
  },
  {
    labelKey: 'guestRewards',
    href: '/app/consumer-loyalty',
    icon: Gift,
    keywordsKey: 'guestRewards',
    permission: 'CATALOG_VIEW' as const,
  },
  {
    labelKey: 'settings',
    href: '/app/settings',
    icon: Settings,
    keywordsKey: 'settings',
    permission: 'SETTINGS_VIEW' as const,
  },
] as const

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('navigation')
  const { can, canAny } = usePermissions()

  const visibleItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if ('anyOf' in item && item.anyOf?.length) return canAny(...item.anyOf)
        if ('permission' in item && item.permission) return can(item.permission)
        return true
      }),
    [can, canAny]
  )

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
          {visibleItems.map(({ labelKey, href, icon: Icon, keywordsKey }) => {
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
