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
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="slg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#5b21b6" />
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="20" fill="url(#slg)" />
      {/* Outer hexagon */}
      <polygon
        points="40,9 67,24.5 67,55.5 40,71 13,55.5 13,24.5"
        stroke="white"
        strokeWidth="2.5"
        fill="none"
      />
      {/* Inner hexagon */}
      <polygon
        points="40,20 57,30 57,50 40,60 23,50 23,30"
        stroke="white"
        strokeWidth="1.5"
        fill="none"
        opacity={0.45}
      />
      {/* Center node */}
      <circle cx="40" cy="40" r="4" fill="white" opacity={0.85} />
      {/* Radial supply chain lines — only shown at size ≥ 32 */}
      {size >= 32 && (
        <>
          <line
            x1="40" y1="40" x2="67" y2="24.5"
            stroke="white" strokeWidth="1" opacity={0.3} strokeDasharray="3 3"
          />
          <line
            x1="40" y1="40" x2="13" y2="55.5"
            stroke="white" strokeWidth="1" opacity={0.3} strokeDasharray="3 3"
          />
          <line
            x1="40" y1="40" x2="67" y2="55.5"
            stroke="white" strokeWidth="1" opacity={0.2} strokeDasharray="3 3"
          />
        </>
      )}
    </svg>
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
