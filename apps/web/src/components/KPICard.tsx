import { Card, CardContent, CardHeader } from './ui/card'
import { cn } from '../lib/utils'
import type { LucideIcon } from 'lucide-react'

export function KPICard({
  title,
  value,
  description,
  icon: Icon,
  className,
}: {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  className?: string
}) {
  return (
    <Card className={cn('transition-shadow hover:shadow-md border-gray-200/80', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-4 px-4">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500">{title}</span>
        <Icon className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="text-xl font-bold tracking-tight text-gray-900">{value}</div>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </CardContent>
    </Card>
  )
}
