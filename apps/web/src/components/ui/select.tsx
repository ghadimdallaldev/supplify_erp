import * as React from 'react'
import { cn } from '../../lib/utils'
import { ChevronDown } from 'lucide-react'

// Context for Select component
const SelectContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

// Main Select component - wraps everything
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
  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <div {...props}>{children}</div>
    </SelectContext.Provider>
  )
}

// SelectTrigger - the visible select element
const SelectTrigger = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<'select'> & {
    placeholder?: string
  }
>(({ className, children, placeholder, value, onChange, ...props }, ref) => {
  const context = React.useContext(SelectContext)
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
        value={selectValue}
        onChange={handleChange}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

// SelectValue - just renders children (for compatibility with Radix pattern, but we use native select)
const SelectValue = ({
  placeholder,
  children,
}: {
  placeholder?: string
  children?: React.ReactNode
}) => {
  // In native select, this is just for display - the actual value is in SelectTrigger
  return <>{placeholder || children}</>
}
SelectValue.displayName = 'SelectValue'

// SelectContent - wrapper for items (for compatibility, but not needed for native select)
const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'>
>(({ className, children }) => {
  // For native select, this doesn't render anything - items go directly in SelectTrigger
  return null
})
SelectContent.displayName = 'SelectContent'

// SelectItem - renders as option
const SelectItem = React.forwardRef<
  HTMLOptionElement,
  React.ComponentProps<'option'>
>(({ className, children, ...rest }, ref) => {
  return (
    <option ref={ref} className={cn(className)} {...rest}>
      {children}
    </option>
  )
})
SelectItem.displayName = 'SelectItem'

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }

