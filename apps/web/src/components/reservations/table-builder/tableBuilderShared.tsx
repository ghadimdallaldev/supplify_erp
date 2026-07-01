import type { ComponentType, SVGProps } from 'react'
import type {
  Reservation,
  ReservationTable,
  ReservationTableShape,
  ReservationTableZone,
} from '../../../types'
import { Circle, RectangleHorizontal, Square, Armchair, Sparkles } from 'lucide-react'
import { i18n } from '../../../i18n'

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
  /** View-only mode for users without reservation edit permissions. */
  readOnly?: boolean
}

export interface ServiceInfo {
  status: string
  customerName: string
  partySize: number
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const SHAPE_PRESET_BASE: Array<{
  value: TableShape
  width: number
  height: number
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}> = [
  { value: 'round', width: 120, height: 120, Icon: Circle },
  { value: 'square', width: 115, height: 115, Icon: Square },
  { value: 'rectangle', width: 160, height: 100, Icon: RectangleHorizontal },
  { value: 'booth', width: 180, height: 110, Icon: Armchair },
  { value: 'chef_table', width: 200, height: 90, Icon: Sparkles },
]

export function getShapePresets() {
  return SHAPE_PRESET_BASE.map((preset) => ({
    ...preset,
    label: i18n.t(`reservations:tableBuilder.shapes.${preset.value}.label`),
    description: i18n.t(`reservations:tableBuilder.shapes.${preset.value}.description`),
  }))
}

export function shapePresetLabel(shape: TableShape) {
  return i18n.t(`reservations:tableBuilder.shapes.${shape}.label`)
}

const COLOR_PRESET_BASE = [
  { value: '#2563eb', key: 'classicBlue' },
  { value: '#0ea5e9', key: 'aqua' },
  { value: '#16a34a', key: 'gardenGreen' },
  { value: '#f97316', key: 'sunsetOrange' },
  { value: '#facc15', key: 'goldenHour' },
  { value: '#a855f7', key: 'lavender' },
  { value: '#f87171', key: 'rose' },
  { value: '#475569', key: 'slate' },
] as const

export function getColorPresets() {
  return COLOR_PRESET_BASE.map((preset) => ({
    ...preset,
    label: i18n.t(`reservations:tableBuilder.colors.${preset.key}`),
  }))
}

const ZONE_BASE: Array<{ value: TableZone; emoji: string }> = [
  { value: 'main', emoji: '🍽️' },
  { value: 'patio', emoji: '☀️' },
  { value: 'bar', emoji: '🍸' },
  { value: 'vip', emoji: '⭐' },
  { value: 'private', emoji: '🔒' },
]

export function getZones() {
  return ZONE_BASE.map((zone) => ({
    ...zone,
    label: i18n.t(`reservations:tableBuilder.zones.${zone.value}`),
  }))
}

const FEATURE_BASE = [
  'accessible',
  'window',
  'high_top',
  'power',
  'romantic',
  'near_music',
] as const

export function getFeatureOptions() {
  return FEATURE_BASE.map((value) => ({
    value,
    label: i18n.t(`reservations:tableBuilder.features.${value}`),
  }))
}

const SERVICE_STATUS_STYLE_BASE: Record<string, { bg: string; border: string; key: string }> = {
  SEATED: { bg: '#16a34a18', border: '#16a34a', key: 'SEATED' },
  CONFIRMED: { bg: '#2563eb18', border: '#2563eb', key: 'CONFIRMED' },
  PENDING: { bg: '#f9731618', border: '#f97316', key: 'PENDING' },
  WAITLIST: { bg: '#eab30818', border: '#eab308', key: 'WAITLIST' },
  available: { bg: '#f8fafc', border: '#cbd5e1', key: 'available' },
}

export function getServiceStatusStyles() {
  return Object.fromEntries(
    Object.entries(SERVICE_STATUS_STYLE_BASE).map(([status, style]) => [
      status,
      {
        bg: style.bg,
        border: style.border,
        label: i18n.t(`reservations:tableBuilder.serviceStatus.${style.key}`),
      },
    ])
  ) as Record<string, { bg: string; border: string; label: string }>
}

export function featureLabel(feature: string) {
  const key = `reservations:tableBuilder.features.${feature}`
  const translated = i18n.t(key)
  return translated === feature ? feature.replace(/_/g, ' ') : translated
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

export const shapeDefaults = SHAPE_PRESET_BASE.reduce(
  (acc, preset) => {
    acc[preset.value] = preset
    return acc
  },
  {} as Record<TableShape, (typeof SHAPE_PRESET_BASE)[number]>
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
  const colorPresets = getColorPresets()

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

    const color = typeof layout.color === 'string' ? layout.color : colorPresets[0].value
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
