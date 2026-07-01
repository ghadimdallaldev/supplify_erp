import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { publicFrontendUrl } from '../../lib/env'
import { useResolvePublicHostQuery } from '../../services/api'
import { PageLoading } from '../ui/page-loading'
import { PublicSupplierCatalogPage } from '../../pages/PublicSupplierCatalogPage'

function platformHostname() {
  try {
    return new URL(publicFrontendUrl).hostname.toLowerCase()
  } catch {
    return 'localhost'
  }
}

/**
 * When the SPA is loaded on a verified Platinum custom domain, render the
 * supplier catalog at the site root instead of the main app shell.
 */
export function CustomDomainCatalogHost({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setHost(window.location.hostname.toLowerCase())
  }, [])

  const platformHost = useMemo(() => platformHostname(), [])
  const isCustomHost =
    host != null && host !== platformHost && host !== 'localhost' && host !== '127.0.0.1'

  const { data, isLoading, isError } = useResolvePublicHostQuery(host ?? '', {
    skip: !isCustomHost || !host,
  })

  if (!isCustomHost || !host) {
    return <>{children}</>
  }

  if (isLoading) {
    return <PageLoading />
  }

  if (isError || !data?.slug) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--brand-ultra)] p-6 text-center">
        <p className="text-sm text-[var(--text-mid)]">
          This domain is not configured for a Supplify catalog yet.
        </p>
      </div>
    )
  }

  return <PublicSupplierCatalogPage forcedSlug={data.slug} whiteLabel />
}
