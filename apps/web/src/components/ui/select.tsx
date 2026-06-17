import * as React from 'react'
import { cn } from '../../lib/utils'
import { ChevronDown } from 'lucide-react'

const SelectContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

const SelectOptionsContext = React.createContext<React.ReactNode>(null)

function getDisplayName(type: unknown): string | undefined {
  if (!type || (typeof type !== 'function' && typeof type !== 'object')) return undefined
  const t = type as { displayName?: string; name?: string }
  return t.displayName || t.name
}

function collectSelectContent(children: React.ReactNode): React.ReactNode {
  let content: React.ReactNode = null
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && getDisplayName(child.type) === 'SelectContent') {
      content = child.props.children
    }
  })
  return content
}

const Select = ({
  value,
  onValueChange,
  children,
  ...props
}: {
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) => {
  const options = React.useMemo(() => collectSelectContent(children), [children])
  const visibleChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && getDisplayName(child.type) === 'SelectContent') {
      return null
    }
    return child
  })

  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <SelectOptionsContext.Provider value={options}>
        <div {...props}>{visibleChildren}</div>
      </SelectOptionsContext.Provider>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<'select'> & {
    placeholder?: string
  }
>(({ className, children, placeholder, value, onChange, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  const options = React.useContext(SelectOptionsContext)
  const selectValue = context.value !== undefined ? context.value : value
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (context.onValueChange) {
      context.onValueChange(e.target.value)
    }
    if (onChange) {
      onChange(e)
    }
  }

  return (
    <div className="relative">
      <select
        ref={ref}
        value={selectValue ?? ''}
        onChange={handleChange}
        className={cn(
          'flex h-10 w-full cursor-pointer appearance-none rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 py-2 pe-10 text-sm text-[var(--text)] transition-colors duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--text-muted)] hover:border-[var(--brand-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:border-[var(--brand-mid)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--app-border-mid)]',
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options}
        {!options && children}
      </select>
      <ChevronDown className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]" />
    </div>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

const SelectValue = (_props: { placeholder?: string; children?: React.ReactNode }) => null
SelectValue.displayName = 'SelectValue'

const SelectContent = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  (_props, _ref) => null
)
SelectContent.displayName = 'SelectContent'

const SelectItem = React.forwardRef<HTMLOptionElement, React.ComponentProps<'option'>>(
  ({ className, children, ...rest }, ref) => {
    return (
      <option ref={ref} className={cn(className)} {...rest}>
        {children}
      </option>
    )
  }
)
SelectItem.displayName = 'SelectItem'

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
