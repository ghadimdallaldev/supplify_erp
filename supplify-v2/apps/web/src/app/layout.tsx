import './globals.css'
import type { Metadata } from 'next'
import { Providers } from '@/components/providers'
import { Navigation } from '@/components/navigation'

export const metadata: Metadata = {
  title: 'Supplify v2',
  description: 'Supplify - Restaurant Supply Management Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <Navigation />
          {children}
        </Providers>
      </body>
    </html>
  )
}
