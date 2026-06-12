import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, ShoppingCart, Truck, Users, Settings } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command'

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
  { label: 'Products', href: '/app/products', icon: Package, keywords: 'catalog search' },
  { label: 'Orders', href: '/app/orders', icon: ShoppingCart, keywords: 'purchase' },
  { label: 'Fulfillment', href: '/app/fulfillment', icon: Truck, keywords: 'delivery shipping' },
  { label: 'Staff', href: '/app/staff', icon: Users, keywords: 'team employees' },
  { label: 'Settings', href: '/app/settings', icon: Settings, keywords: 'preferences account' },
] as const

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()

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
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map(({ label, href, icon: Icon, keywords }) => (
            <CommandItem
              key={href}
              value={`${label} ${keywords}`}
              onSelect={() => runCommand(href)}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
