import type { ReservationTableShape } from '../../../types'
import { MAX_VISIBLE_CHAIRS } from './tableBuilderShared'

interface ChairLayerProps {
  shape: ReservationTableShape
  capacity: number
  widthPx: number
  heightPx: number
  color: string
  isActive: boolean
}

export function ChairLayer({
  shape,
  capacity,
  widthPx,
  heightPx,
  color,
  isActive,
}: ChairLayerProps) {
  const count = Math.min(capacity, MAX_VISIBLE_CHAIRS)
  if (count === 0) return null
  const chairColor = isActive ? color : '#94a3b8'
  const chairOpacity = isActive ? 0.6 : 0.4

  // Chair dimensions
  const cw = Math.max(6, Math.min(9, widthPx * 0.08))
  const ch = Math.max(5, Math.min(8, heightPx * 0.08))
  const gap = 6 // gap between table edge and chair

  const svgW = widthPx + (cw + gap) * 2
  const svgH = heightPx + (ch + gap) * 2
  const ox = cw + gap // offset: table origin inside SVG
  const oy = ch + gap

  const chairs: JSX.Element[] = []

  if (shape === 'round') {
    // Arrange chairs in a circle around the perimeter
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      const rx = widthPx / 2 + gap + cw / 2
      const ry = heightPx / 2 + gap + ch / 2
      const cx = ox + widthPx / 2 + rx * Math.cos(angle)
      const cy = oy + heightPx / 2 + ry * Math.sin(angle)
      const rotateDeg = (angle * 180) / Math.PI + 90
      chairs.push(
        <rect
          key={i}
          x={cx - cw / 2}
          y={cy - ch / 2}
          width={cw}
          height={ch}
          rx={2}
          ry={2}
          fill={chairColor}
          fillOpacity={chairOpacity}
          transform={`rotate(${rotateDeg} ${cx} ${cy})`}
        />
      )
    }
  } else if (shape === 'booth') {
    // Chairs on top and bottom only (bench seats)
    const topCount = Math.ceil(count / 2)
    const botCount = Math.floor(count / 2)

    const placeRow = (n: number, rowY: number) => {
      if (n === 0) return
      const spacing = widthPx / (n + 1)
      for (let i = 0; i < n; i++) {
        const cx = ox + spacing * (i + 1)
        chairs.push(
          <rect
            key={`${rowY}-${i}`}
            x={cx - cw / 2}
            y={rowY - ch / 2}
            width={cw}
            height={ch}
            rx={2}
            ry={2}
            fill={chairColor}
            fillOpacity={chairOpacity}
          />
        )
      }
    }

    placeRow(topCount, oy - gap / 2)
    placeRow(botCount, oy + heightPx + gap / 2)
  } else if (shape === 'chef_table') {
    // Chairs on bottom only
    const n = count
    if (n > 0) {
      const spacing = widthPx / (n + 1)
      for (let i = 0; i < n; i++) {
        const cx = ox + spacing * (i + 1)
        const cy = oy + heightPx + gap / 2
        chairs.push(
          <rect
            key={i}
            x={cx - cw / 2}
            y={cy - ch / 2}
            width={cw}
            height={ch}
            rx={2}
            ry={2}
            fill={chairColor}
            fillOpacity={chairOpacity}
          />
        )
      }
    }
  } else {
    // square / rectangle: distribute on all 4 sides proportionally
    const perimRatio = widthPx / (widthPx + heightPx)
    const longSideCount = Math.round(count * perimRatio * 0.6)
    const shortSideCount = Math.max(0, Math.round((count - longSideCount * 2) / 2))

    const topCount = Math.max(0, longSideCount)
    const botCount = Math.max(0, count - topCount - shortSideCount * 2)
    const leftCount = shortSideCount
    const rightCount = shortSideCount

    const placeHRow = (n: number, rowY: number) => {
      if (n <= 0) return
      const spacing = widthPx / (n + 1)
      for (let i = 0; i < n; i++) {
        const cx = ox + spacing * (i + 1)
        chairs.push(
          <rect
            key={`h-${rowY}-${i}`}
            x={cx - cw / 2}
            y={rowY - ch / 2}
            width={cw}
            height={ch}
            rx={2}
            ry={2}
            fill={chairColor}
            fillOpacity={chairOpacity}
          />
        )
      }
    }

    const placeVCol = (n: number, colX: number) => {
      if (n <= 0) return
      const spacing = heightPx / (n + 1)
      for (let i = 0; i < n; i++) {
        const cy = oy + spacing * (i + 1)
        chairs.push(
          <rect
            key={`v-${colX}-${i}`}
            x={colX - ch / 2}
            y={cy - cw / 2}
            width={ch}
            height={cw}
            rx={2}
            ry={2}
            fill={chairColor}
            fillOpacity={chairOpacity}
          />
        )
      }
    }

    placeHRow(topCount, oy - gap / 2)
    placeHRow(botCount, oy + heightPx + gap / 2)
    placeVCol(leftCount, ox - gap / 2)
    placeVCol(rightCount, ox + widthPx + gap / 2)
  }

  return (
    <svg
      width={svgW}
      height={svgH}
      style={{
        position: 'absolute',
        top: -(ch + gap),
        left: -(cw + gap),
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 0,
      }}
    >
      {chairs}
    </svg>
  )
}
