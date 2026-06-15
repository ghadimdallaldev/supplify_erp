import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../../lib/utils'

type PublicPageLayoutProps = {
  children?: ReactNode
  title?: string
  subtitle?: string
  logoUrl?: string | null
  logoInitial?: string
  headerActions?: ReactNode
  centered?: boolean
  narrow?: boolean
  wide?: boolean
  className?: string
  style?: CSSProperties
}

export function PublicPageLayout({
  children,
  title,
  subtitle,
  logoUrl,
  logoInitial,
  headerActions,
  centered = false,
  narrow = false,
  wide = false,
  className,
  style,
}: PublicPageLayoutProps) {
  const showHero = title || subtitle || logoUrl || logoInitial
  const widthClass = narrow ? 'max-w-xl' : wide ? 'max-w-6xl' : 'max-w-3xl'

  return (
    <div className={cn('min-h-dvh bg-[var(--brand-ultra)]', className)} style={style}>
      {showHero && (
        <header className="border-b border-[var(--app-border)] bg-[var(--surface)] pwa-safe-top">
          <div className={cn('mx-auto px-4 py-5 sm:px-6', widthClass, centered && 'text-center')}>
            <div
              className={cn(
                'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
                centered && 'sm:flex-col sm:items-center'
              )}
            >
              <div className={cn('flex min-w-0 gap-4', centered && 'flex-col items-center')}>
                {(logoUrl || logoInitial) &&
                  (logoUrl ? (
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-2xl object-cover sm:h-16 sm:w-16"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-pale)] text-xl font-semibold text-[var(--brand-mid)] sm:h-16 sm:w-16 sm:text-2xl"
                    >
                      {logoInitial}
                    </div>
                  ))}
                <div className={cn('min-w-0', centered && 'flex flex-col items-center')}>
                  {title && (
                    <h1
                      className="text-pretty text-xl font-semibold text-[var(--text)] sm:text-2xl"
                      style={{ textWrap: 'balance' }}
                    >
                      {title}
                    </h1>
                  )}
                  {subtitle && (
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-mid)]">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              {headerActions && (
                <div className={cn('flex shrink-0 flex-wrap gap-2', centered && 'justify-center')}>
                  {headerActions}
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <main
        className={cn(
          'mx-auto px-4 py-6 pwa-safe-bottom sm:px-6 sm:py-8',
          widthClass,
          centered && 'flex flex-col items-center'
        )}
      >
        {children}
      </main>
    </div>
  )
}

type PublicPanelProps = {
  children: ReactNode
  title?: string
  description?: string
  className?: string
}

export function PublicPanel({ children, title, description, className }: PublicPanelProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4 sm:p-5',
        className
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>}
          {description && <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}

export default PublicPageLayout
