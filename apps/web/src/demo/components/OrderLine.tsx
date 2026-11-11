'use client'
import { useEffect, useState } from 'react'
import { LIFECYCLE } from '@/demo/lib/fixtures'
import { useInView, useReducedMotion } from '@/demo/lib/hooks'

export type Station = { label: string; caption?: string }

// Where the order sits on the line for each real lifecycle status (0..4 along five stations).
const POS = [1, 2, 3, 3.5, 4, 4, 4]

export function chipTone(status: string) {
  if (status === 'Placed') return 'amber'
  if (status === 'Delivered' || status === 'Received') return 'mint'
  if (status === 'Invoiced') return 'ink'
  return 'violet'
}

/** The Order Line: one rail through five stations. Draws once; the chip ticks through the real lifecycle. */
export function OrderLine({
  stations,
  chip = false,
  variant = 'hero',
  label,
}: {
  stations: Station[]
  chip?: boolean
  variant?: 'hero' | 'eco'
  label: string
}) {
  const reduced = useReducedMotion()
  const [ref, seen] = useInView<HTMLDivElement>(0.25)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!chip) return
    if (reduced) {
      setIdx(LIFECYCLE.length - 1)
      return
    }
    if (!seen) return
    setIdx(0)
    const start = setTimeout(() => {
      const t = setInterval(() => {
        setIdx((i) => {
          if (i >= LIFECYCLE.length - 1) {
            clearInterval(t)
            return i
          }
          return i + 1
        })
      }, 1100)
    }, 1500)
    return () => clearTimeout(start)
  }, [chip, reduced, seen])

  const status = LIFECYCLE[idx]
  const pos = POS[idx]
  const drawn = seen || reduced

  return (
    <div
      ref={ref}
      className={`oline oline-${variant}`}
      data-drawn={drawn}
      style={{ ['--n' as string]: stations.length, ['--p' as string]: pos }}
    >
      <div className="oline-rail" aria-hidden="true" />
      {variant === 'eco' && drawn && !reduced && <div className="oline-pulse" aria-hidden="true" />}
      <ol className="oline-stations" aria-label={label}>
        {stations.map((s, i) => (
          <li
            key={s.label}
            className="station"
            style={{ ['--i' as string]: i }}
            data-reached={chip ? i <= Math.floor(pos) || undefined : drawn || undefined}
          >
            <span className="dot" aria-hidden="true" />
            <span className="slabel">{s.label}</span>
            {s.caption && <span className="scap">{s.caption}</span>}
          </li>
        ))}
      </ol>
      {chip && (
        <div className="oline-chip" aria-hidden="true">
          <span className="mono">#HB-2041</span>
          <span className={`chip chip-${chipTone(status)}`} key={status}>
            {status}
          </span>
        </div>
      )}
    </div>
  )
}
