const LOGO_SRC = '/brand/supplify-logo.png'

interface SupplifyLogoProps {
  size?: number
  variant?: 'mark' | 'lockup'
  theme?: 'light' | 'dark'
  tagline?: boolean
}

export function SupplifyLogo({
  size = 40,
  variant = 'lockup',
  theme = 'light',
  tagline = true,
}: SupplifyLogoProps) {
  const wordmarkColor = theme === 'dark' ? '#ffffff' : '#1e0b3a'
  const taglineColor = theme === 'dark' ? 'rgba(255,255,255,0.5)' : '#8b7aaa'

  const mark = (
    <img
      src={LOGO_SRC}
      alt="Supplify"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  )

  if (variant === 'mark') return mark

  const wordmarkSize = Math.round(size * 0.5)
  const taglineSize = Math.max(9, Math.round(size * 0.25))

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.28) }}>
      {mark}
      <div>
        <div
          style={{
            fontSize: wordmarkSize,
            fontWeight: 800,
            color: wordmarkColor,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Supplify
        </div>
        {tagline && (
          <div
            style={{
              fontSize: taglineSize,
              fontWeight: 500,
              color: taglineColor,
              letterSpacing: '0.02em',
              fontFamily: "'Inter', system-ui, sans-serif",
            }}
          >
            Enterprise ERP
          </div>
        )}
      </div>
    </div>
  )
}
