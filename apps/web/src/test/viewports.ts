/** Standard viewport widths for responsive UI tests (px). */
export const VIEWPORT_WIDTHS = {
  phone: 320,
  tablet: 768,
  laptop: 1024,
  desktop: 1280,
} as const

export type ViewportName = keyof typeof VIEWPORT_WIDTHS

/** Tailwind `lg` — card list below, compact table at/above. */
export const LG_BREAKPOINT_PX = 1024

/** Tailwind `xl` — full table density. */
export const XL_BREAKPOINT_PX = 1280

const LG_HIDDEN = /(?:^|\s)lg:hidden(?:\s|$)/
const HIDDEN = /(?:^|\s)hidden(?:\s|$)/
const LG_BLOCK = /(?:^|\s)lg:block(?:\s|$)/

/**
 * Assert the hybrid card/table split uses lg-tier Tailwind classes.
 * Responsive layout is compile-time (class strings), not runtime media queries.
 */
export function expectLgCardTableSplit(cardEl: HTMLElement, tableEl: HTMLElement) {
  if (!LG_HIDDEN.test(cardEl.className)) {
    throw new Error(`Expected card container to include lg:hidden, got: ${cardEl.className}`)
  }
  if (!HIDDEN.test(tableEl.className)) {
    throw new Error(`Expected table container to include hidden, got: ${tableEl.className}`)
  }
  if (!LG_BLOCK.test(tableEl.className)) {
    throw new Error(`Expected table container to include lg:block, got: ${tableEl.className}`)
  }
}

export function setViewportSize(width: number, height = 800) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  })
}

/** Install a matchMedia stub keyed off `window.innerWidth` (for hooks using useMediaQuery). */
export function installMatchMedia() {
  window.matchMedia = (query: string): MediaQueryList => {
    const minMatch = query.match(/\(min-width:\s*(\d+(?:\.\d+)?)(px|rem)\)/)
    const maxMatch = query.match(/\(max-width:\s*(\d+(?:\.\d+)?)(px|rem)\)/)

    const toPx = (value: string, unit: string) =>
      unit === 'rem' ? Number(value) * 16 : Number(value)

    const evaluate = () => {
      const w = window.innerWidth
      if (minMatch) {
        const minPx = toPx(minMatch[1], minMatch[2])
        if (w < minPx) return false
      }
      if (maxMatch) {
        const maxPx = toPx(maxMatch[1], maxMatch[2])
        if (w > maxPx) return false
      }
      return true
    }

    let matches = evaluate()

    const mql: MediaQueryList = {
      media: query,
      get matches() {
        return evaluate()
      },
      onchange: null,
      addEventListener(_type, listener) {
        window.addEventListener('resize', () => {
          const next = evaluate()
          if (next !== matches) {
            matches = next
            listener({ matches: next, media: query } as MediaQueryListEvent)
          }
        })
      },
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => true,
    }

    return mql
  }
}

export function withViewport<T>(width: number, fn: () => T): T {
  const prevWidth = window.innerWidth
  const prevHeight = window.innerHeight
  setViewportSize(width)
  try {
    return fn()
  } finally {
    setViewportSize(prevWidth, prevHeight)
  }
}
