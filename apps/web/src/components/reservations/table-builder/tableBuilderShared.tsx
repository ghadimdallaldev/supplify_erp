import type { ComponentType, SVGProps } from 'react'
import type {
  Reservation,
  ReservationTable,
  ReservationTableShape,
  ReservationTableZone,
} from '../../../types'
import { Circle, RectangleHorizontal, Square, Armchair, Sparkles } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_CANVAS_WIDTH = 900
export const DEFAULT_CANVAS_HEIGHT = 520
export const MIN_SIZE_RATIO = 0.06
export const MAX_SIZE_RATIO = 0.5
export const GRID_PX = 40
export const MAX_HISTORY = 20
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 2.0
export const ZOOM_STEP = 0.25
export const MAX_VISIBLE_CHAIRS = 12

// ─── Types ────────────────────────────────────────────────────────────────────

export type TableShape = ReservationTableShape
export type TableZone = ReservationTableZone

export interface EditableTable {
  localId: string
  id?: string
  name: string
  capacity: number
  branchId?: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  shape: TableShape
  color: string
  zone: TableZone
  features: string[]
  notes?: string
  isActive: boolean
}

export interface ReservationTableBuilderProps {
  tables: ReservationTable[]
  reservations?: Reservation[]
  /** When true, floor canvas shows guest names on assigned tables (Live view). */
  defaultLiveView?: boolean
}

export interface ServiceInfo {
  status: string
  customerName: string
  partySize: number
}

// ─── Static Data ──────────────────────────────────────────────────────────────

export const SHAPE_PRESETS: Array<{
  value: TableShape
  label: string
  description: string
  width: number
  height: number
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}> = [
  {
    value: 'round',
    label: 'Round',
    description: 'Perfect for intimate groups.',
    width: 120,
    height: 120,
    Icon: Circle,
  },
  {
    value: 'square',
    label: 'Square',
    description: 'Ideal for couples.',
    width: 115,
    height: 115,
    Icon: Square,
  },
  {
    value: 'rectangle',
    label: 'Banquet',
    description: 'Seats larger parties.',
    width: 160,
    height: 100,
    Icon: RectangleHorizontal,
  },
  {
    value: 'booth',
    label: 'Booth',
    description: 'Cozy seating with privacy.',
    width: 180,
    height: 110,
    Icon: Armchair,
  },
  {
    value: 'chef_table',
    label: "Chef's table",
    description: 'Facing the action.',
    width: 200,
    height: 90,
    Icon: Sparkles,
  },
]

export const COLOR_PRESETS = [
  { value: '#2563eb', label: 'Classic blue' },
  { value: '#0ea5e9', label: 'Aqua' },
  { value: '#16a34a', label: 'Garden green' },
  { value: '#f97316', label: 'Sunset orange' },
  { value: '#facc15', label: 'Golden hour' },
  { value: '#a855f7', label: 'Lavender' },
  { value: '#f87171', label: 'Rose' },
  { value: '#475569', label: 'Slate' },
]

export const ZONES: Array<{ value: TableZone; label: string; emoji: string }> = [
  { value: 'main', label: 'Main floor', emoji: '🍽️' },
  { value: 'patio', label: 'Patio', emoji: '☀️' },
  { value: 'bar', label: 'Bar', emoji: '🍸' },
  { value: 'vip', label: 'VIP', emoji: '⭐' },
  { value: 'private', label: 'Private', emoji: '🔒' },
]

export const FEATURE_OPTIONS = [
  { value: 'accessible', label: 'Accessible' },
  { value: 'window', label: 'Window view' },
  { value: 'high_top', label: 'High top' },
  { value: 'power', label: 'Power outlet' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'near_music', label: 'Near live music' },
]

export const SERVICE_STATUS_STYLES: Record<string, { bg: string; border: string; label: string }> =
  {
    SEATED: { bg: '#16a34a18', border: '#16a34a', label: 'Seated' },
    CONFIRMED: { bg: '#2563eb18', border: '#2563eb', label: 'Confirmed' },
    PENDING: { bg: '#f9731618', border: '#f97316', label: 'Pending' },
    WAITLIST: { bg: '#eab30818', border: '#eab308', label: 'Waitlist' },
    available: { bg: '#f8fafc', border: '#cbd5e1', label: 'Available' },
  }

// ─── Helper Functions ─────────────────────────────────────────────────────────

type ShapePresetRow = (typeof SHAPE_PRESETS)[number]

export const shapeDefaults = SHAPE_PRESETS.reduce(
  (acc, p) => {
    acc[p.value] = p
    return acc
  },
  {} as Record<TableShape, ShapePresetRow>
)

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export const createLocalId = (id?: string) =>
  id ?? `temp-${Math.random().toString(36).slice(2, 11)}`

const normalizeCoordinate = (value: unknown, fallback: number, baseDimension: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  if (value <= 1) return clamp(value, 0, 1)
  if (value <= 10) return clamp(value / 10, 0, 1)
  return clamp(value / baseDimension, 0, 1)
}

const normalizeDimension = (value: unknown, fallback: number, base: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  if (value <= 1.2) return clamp(value, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
  return clamp(value / base, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
}

export type TableRect = { x: number; y: number; width: number; height: number }

const POSITION_PAD = 0.02

/** True when the table has been placed on the canvas (not API/DB default origin). */
const hasStoredPosition = (position?: { x?: number; y?: number } | null) => {
  if (!position) return false
  const { x, y } = position
  if (typeof x !== 'number' || typeof y !== 'number' || Number.isNaN(x) || Number.isNaN(y)) {
    return false
  }
  return !(x === 0 && y === 0)
}

const rectsOverlap = (a: TableRect, b: TableRect) =>
  !(
    a.x + a.width + POSITION_PAD <= b.x ||
    b.x + b.width + POSITION_PAD <= a.x ||
    a.y + a.height + POSITION_PAD <= b.y ||
    b.y + b.height + POSITION_PAD <= a.y
  )

/** Next open slot on a simple grid so new tables never stack on (0, 0). */
export const findNextTablePosition = (
  existing: TableRect[],
  width: number,
  height: number
): { x: number; y: number } => {
  const COLS = 4
  const padX = 0.04
  const padY = 0.04
  const startX = 0.06
  const startY = 0.06
  const cellW = Math.max(width + padX, 0.12)
  const cellH = Math.max(height + padY, 0.12)

  for (let i = 0; i < 80; i++) {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const x = startX + col * cellW
    const y = startY + row * cellH
    if (x + width > 0.97 || y + height > 0.97) continue

    const candidate: TableRect = { x, y, width, height }
    if (!existing.some((t) => rectsOverlap(candidate, t))) {
      return { x: clamp(x, 0, 1 - width), y: clamp(y, 0, 1 - height) }
    }
  }

  const n = existing.length
  const col = n % COLS
  const row = Math.floor(n / COLS)
  return {
    x: clamp(startX + col * cellW, 0, 1 - width),
    y: clamp(startY + row * cellH, 0, 1 - height),
  }
}

export const hydrateTables = (tables: ReservationTable[]): EditableTable[] => {
  const placed: EditableTable[] = []

  for (const table of tables) {
    const layout = table.layout ?? {}
    const shape = (layout.shape as TableShape) || 'round'
    const defaults = shapeDefaults[shape] ?? shapeDefaults.round

    const widthRatio = normalizeDimension(
      layout.widthRatio,
      normalizeDimension(layout.width, defaults.width, DEFAULT_CANVAS_WIDTH),
      DEFAULT_CANVAS_WIDTH
    )
    const heightRatio = normalizeDimension(
      layout.heightRatio,
      normalizeDimension(layout.height, defaults.height, DEFAULT_CANVAS_HEIGHT),
      DEFAULT_CANVAS_HEIGHT
    )

    const position = (table.position || {}) as { x?: number; y?: number }
    let xRatio: number
    let yRatio: number

    if (hasStoredPosition(position)) {
      xRatio = normalizeCoordinate(position.x, 0.2, DEFAULT_CANVAS_WIDTH)
      yRatio = normalizeCoordinate(position.y, 0.2, DEFAULT_CANVAS_HEIGHT)
    } else {
      const slot = findNextTablePosition(placed, widthRatio, heightRatio)
      xRatio = slot.x
      yRatio = slot.y
    }

    const color = typeof layout.color === 'string' ? layout.color : COLOR_PRESETS[0].value
    const zone = (layout.zone as TableZone) || 'main'
    const features = Array.isArray(layout.features)
      ? (layout.features.filter((f) => typeof f === 'string') as string[])
      : []
    const rotation = typeof layout.rotation === 'number' ? layout.rotation : 0

    placed.push({
      localId: createLocalId(table.id),
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      branchId: table.branch_id || null,
      x: clamp(xRatio, 0, 1 - widthRatio),
      y: clamp(yRatio, 0, 1 - heightRatio),
      width: clamp(widthRatio, MIN_SIZE_RATIO, MAX_SIZE_RATIO),
      height: clamp(heightRatio, MIN_SIZE_RATIO, MAX_SIZE_RATIO),
      rotation,
      shape,
      color,
      zone,
      notes: typeof layout.notes === 'string' ? layout.notes : undefined,
      features,
      isActive: table.is_active !== false,
    })
  }

  return placed
}
