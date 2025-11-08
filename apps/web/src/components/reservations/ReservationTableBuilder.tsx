import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { Rnd } from 'react-rnd'
import type { ReservationTable, ReservationTableShape, ReservationTableZone } from '../../types'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { Textarea } from '../ui/textarea'
import { useSaveReservationTablesMutation } from '../../services/reservationsApi'
import { toast } from 'react-hot-toast'
import { Circle, RectangleHorizontal, Square, Armchair, Sparkles, Copy, RotateCcw, Trash2 } from 'lucide-react'

const DEFAULT_CANVAS_WIDTH = 900
const DEFAULT_CANVAS_HEIGHT = 520
const MIN_SIZE_RATIO = 0.06
const MAX_SIZE_RATIO = 0.5

type TableShape = ReservationTableShape
type TableZone = ReservationTableZone

interface EditableTable {
  localId: string
  id?: string
  name: string
  capacity: number
  branchId?: string | null
  x: number // 0 - 1 ratio relative to canvas width
  y: number // 0 - 1 ratio relative to canvas height
  width: number // ratio
  height: number // ratio
  rotation: number
  shape: TableShape
  color: string
  zone: TableZone
  features: string[]
  notes?: string
  isActive: boolean
}

interface ReservationTableBuilderProps {
  tables: ReservationTable[]
}

const SHAPE_PRESETS: Array<{
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
    description: 'Perfect for intimate groups and celebrations.',
    width: 120,
    height: 120,
    Icon: Circle,
  },
  {
    value: 'square',
    label: 'Square',
    description: 'Ideal for couples and quick turns.',
    width: 115,
    height: 115,
    Icon: Square,
  },
  {
    value: 'rectangle',
    label: 'Banquet',
    description: 'Seats larger parties comfortably.',
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
    label: 'Chef’s table',
    description: 'Showstopper seating facing the action.',
    width: 200,
    height: 90,
    Icon: Sparkles,
  },
]

const COLOR_PRESETS = [
  { value: '#2563eb', label: 'Classic blue' },
  { value: '#0ea5e9', label: 'Aqua' },
  { value: '#16a34a', label: 'Garden green' },
  { value: '#f97316', label: 'Sunset orange' },
  { value: '#facc15', label: 'Golden hour' },
  { value: '#a855f7', label: 'Lavender' },
  { value: '#f87171', label: 'Rose' },
  { value: '#475569', label: 'Slate' },
]

const ZONES: Array<{ value: TableZone; label: string }> = [
  { value: 'main', label: 'Main floor' },
  { value: 'patio', label: 'Outdoor / patio' },
  { value: 'bar', label: 'Bar deck' },
  { value: 'vip', label: 'VIP / lounge' },
  { value: 'private', label: 'Private dining' },
]

const FEATURE_OPTIONS = [
  { value: 'accessible', label: 'Accessible' },
  { value: 'window', label: 'Window view' },
  { value: 'high_top', label: 'High top' },
  { value: 'power', label: 'Power outlet' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'near_music', label: 'Near live music' },
]

const shapeDefaults = SHAPE_PRESETS.reduce<Record<TableShape, (typeof SHAPE_PRESETS)[number]>>((acc, preset) => {
  acc[preset.value] = preset
  return acc
}, {} as Record<TableShape, (typeof SHAPE_PRESETS)[number]>)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const createLocalId = (id?: string) => id ?? `temp-${Math.random().toString(36).slice(2, 11)}`

const normalizeCoordinate = (value: unknown, fallback: number, baseDimension: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  if (value <= 1) {
    return clamp(value, 0, 1)
  }
  if (value <= 10) {
    return clamp(value / 10, 0, 1)
  }
  return clamp(value / baseDimension, 0, 1)
}

const normalizeDimension = (value: unknown, fallback: number, base: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  if (value <= 1.2) {
    return clamp(value, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
  }
  return clamp(value / base, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
}

const hydrateTables = (tables: ReservationTable[]): EditableTable[] => {
  return tables.map((table) => {
    const layout = table.layout ?? {}
    const shape = (layout.shape as TableShape) || 'round'
    const defaults = shapeDefaults[shape] ?? shapeDefaults.round

    const widthRatio = normalizeDimension(layout.widthRatio, normalizeDimension(layout.width, defaults.width, DEFAULT_CANVAS_WIDTH), DEFAULT_CANVAS_WIDTH)
    const heightRatio = normalizeDimension(layout.heightRatio, normalizeDimension(layout.height, defaults.height, DEFAULT_CANVAS_HEIGHT), DEFAULT_CANVAS_HEIGHT)

    const position = (table.position || {}) as { x?: number; y?: number }
    const xRatio = normalizeCoordinate(position.x, Math.random() * 0.6 + 0.2, DEFAULT_CANVAS_WIDTH)
    const yRatio = normalizeCoordinate(position.y, Math.random() * 0.4 + 0.2, DEFAULT_CANVAS_HEIGHT)

    const color = typeof layout.color === 'string' ? layout.color : COLOR_PRESETS[0].value
    const zone = (layout.zone as TableZone) || 'main'
    const features = Array.isArray(layout.features) ? (layout.features.filter((feature) => typeof feature === 'string') as string[]) : []
    const rotation = typeof layout.rotation === 'number' ? layout.rotation : 0

    return {
      localId: createLocalId(table.id),
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      branchId: table.branch_id || null,
      x: clamp(xRatio, 0, 1 - MIN_SIZE_RATIO),
      y: clamp(yRatio, 0, 1 - MIN_SIZE_RATIO),
      width: clamp(widthRatio, MIN_SIZE_RATIO, MAX_SIZE_RATIO),
      height: clamp(heightRatio, MIN_SIZE_RATIO, MAX_SIZE_RATIO),
      rotation,
      shape,
      color,
      zone,
      notes: typeof layout.notes === 'string' ? layout.notes : undefined,
      features,
      isActive: table.is_active !== false,
    }
  })
}

export function ReservationTableBuilder({ tables }: ReservationTableBuilderProps) {
  const [editableTables, setEditableTables] = useState<EditableTable[]>(() => hydrateTables(tables))
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT })
  const canvasRef = useRef<HTMLDivElement | null>(null)

  const [saveTables, { isLoading }] = useSaveReservationTablesMutation()

  useEffect(() => {
    setEditableTables(hydrateTables(tables))
  }, [tables])

  useEffect(() => {
    if (!selectedTableId && editableTables.length) {
      setSelectedTableId(editableTables[0].localId)
      return
    }
    if (selectedTableId && !editableTables.some((table) => table.localId === selectedTableId)) {
      setSelectedTableId(editableTables[0]?.localId ?? null)
    }
  }, [editableTables, selectedTableId])

  useEffect(() => {
    if (!canvasRef.current) return
    const element = canvasRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setCanvasSize({
        width: entry.contentRect.width || DEFAULT_CANVAS_WIDTH,
        height: entry.contentRect.height || DEFAULT_CANVAS_HEIGHT,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const totalCapacity = useMemo(
    () => editableTables.filter((table) => table.isActive).reduce((sum, table) => sum + Number(table.capacity || 0), 0),
    [editableTables],
  )

  const activeTableCount = useMemo(() => editableTables.filter((table) => table.isActive).length, [editableTables])

  const selectedTable = useMemo(
    () => editableTables.find((table) => table.localId === selectedTableId) ?? null,
    [editableTables, selectedTableId],
  )

  const updateTable = (localId: string, updates: Partial<EditableTable>) => {
    setEditableTables((prev) =>
      prev.map((table) => {
        if (table.localId !== localId) return table
        const next = { ...table, ...updates }
        next.width = clamp(next.width, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
        next.height = clamp(next.height, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
        next.x = clamp(next.x, 0, 1 - next.width)
        next.y = clamp(next.y, 0, 1 - next.height)
        next.rotation = ((next.rotation % 360) + 360) % 360
        return next
      }),
    )
  }

  const handleAddTable = (shape: TableShape) => {
    const defaults = shapeDefaults[shape] ?? shapeDefaults.round
    const widthRatio = clamp(defaults.width / DEFAULT_CANVAS_WIDTH, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
    const heightRatio = clamp(defaults.height / DEFAULT_CANVAS_HEIGHT, MIN_SIZE_RATIO, MAX_SIZE_RATIO)

    setEditableTables((prev) => {
      const localId = createLocalId()
      const nextNameBase = `${defaults.label}`
      let suffix = prev.filter((table) => table.name.startsWith(nextNameBase)).length + 1
      let candidateName = `${nextNameBase} ${suffix}`
      while (prev.some((table) => table.name === candidateName)) {
        suffix += 1
        candidateName = `${nextNameBase} ${suffix}`
      }

      const newTable: EditableTable = {
        localId,
        name: candidateName,
        capacity: shape === 'chef_table' ? 8 : shape === 'rectangle' ? 6 : shape === 'booth' ? 4 : 2,
        branchId: null,
        x: clamp(Math.random() * (1 - widthRatio), 0.05, 0.95),
        y: clamp(Math.random() * (1 - heightRatio), 0.05, 0.95),
        width: widthRatio,
        height: heightRatio,
        rotation: 0,
        shape,
        color: COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]?.value || COLOR_PRESETS[0].value,
        zone: 'main',
        features: [],
        isActive: true,
      }

      setSelectedTableId(localId)
      return [...prev, newTable]
    })
  }

  const handleDuplicateTable = (table: EditableTable) => {
    const offsetX = clamp(table.x + table.width * 0.1, 0, 1 - table.width)
    const offsetY = clamp(table.y + table.height * 0.1, 0, 1 - table.height)

    setEditableTables((prev) => {
      const localId = createLocalId()
      const duplicate: EditableTable = {
        ...table,
        id: undefined,
        localId,
        name: `${table.name} copy`,
        x: offsetX,
        y: offsetY,
        notes: table.notes,
        features: [...table.features],
        isActive: table.isActive,
      }
      setSelectedTableId(localId)
      return [...prev, duplicate]
    })
  }

  const handleDeleteTable = (localId: string) => {
    setEditableTables((prev) => prev.filter((table) => table.localId !== localId))
  }

  const handleSave = async () => {
    try {
      const payload = editableTables.map((table) => ({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        branchId: table.branchId || undefined,
        position: {
          x: Number(table.x.toFixed(4)),
          y: Number(table.y.toFixed(4)),
        },
        isActive: table.isActive,
        layout: {
          shape: table.shape,
          color: table.color,
          zone: table.zone,
          features: table.features,
          notes: table.notes,
          rotation: table.rotation,
          widthRatio: Number(table.width.toFixed(4)),
          heightRatio: Number(table.height.toFixed(4)),
          width: Math.round(table.width * DEFAULT_CANVAS_WIDTH),
          height: Math.round(table.height * DEFAULT_CANVAS_HEIGHT),
        },
      }))

      await saveTables({ tables: payload }).unwrap()
      toast.success('Tables saved')
    } catch (error) {
      toast.error('Failed to save tables')
    }
  }

  const renderTableShape = (table: EditableTable) => {
    const isSelected = table.localId === selectedTableId
    const canvasWidth = canvasSize.width || DEFAULT_CANVAS_WIDTH
    const canvasHeight = canvasSize.height || DEFAULT_CANVAS_HEIGHT

    const widthPx = table.width * canvasWidth
    const heightPx = table.height * canvasHeight
    const xPx = table.x * canvasWidth
    const yPx = table.y * canvasHeight

    const borderRadius =
      table.shape === 'round' ? '9999px' : table.shape === 'square' ? '24px' : table.shape === 'booth' ? '32px 32px 12px 12px' : '18px'

    return (
      <Rnd
        key={table.localId}
        size={{ width: widthPx, height: heightPx }}
        position={{ x: xPx, y: yPx }}
        bounds="parent"
        onDragStart={() => setSelectedTableId(table.localId)}
        onDragStop={(_, data) => {
          const nextX = clamp(data.x / canvasWidth, 0, 1 - table.width)
          const nextY = clamp(data.y / canvasHeight, 0, 1 - table.height)
          updateTable(table.localId, { x: nextX, y: nextY })
        }}
        onResizeStop={(_, __, ref, ___, position) => {
          const nextWidth = clamp(ref.offsetWidth / canvasWidth, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
          const nextHeight = clamp(ref.offsetHeight / canvasHeight, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
          const nextX = clamp(position.x / canvasWidth, 0, 1 - nextWidth)
          const nextY = clamp(position.y / canvasHeight, 0, 1 - nextHeight)
          updateTable(table.localId, { width: nextWidth, height: nextHeight, x: nextX, y: nextY })
        }}
        onClick={() => setSelectedTableId(table.localId)}
        className="group"
        enableResizing={table.isActive}
        disableDragging={!table.isActive}
      >
        <div
          className={`relative flex h-full w-full select-none flex-col items-center justify-center border-2 text-xs font-semibold shadow-lg transition ${
            isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-white/80'
          }`}
          style={{
            backgroundColor: `${table.color}20`,
            color: table.color,
            borderRadius,
            transform: `rotate(${table.rotation}deg)`,
          }}
        >
          <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-700 shadow">
            {table.name}
          </span>
          <span className="mt-1 text-[10px] font-medium text-gray-600">{table.capacity} guests</span>
          <div className="absolute -bottom-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {table.features.slice(0, 3).map((feature) => (
              <Badge key={feature} variant="outline" className="border-white/60 bg-white/80 text-[9px] font-medium text-gray-600">
                {feature.replace('_', ' ')}
              </Badge>
            ))}
          </div>
        </div>
      </Rnd>
    )
  }

  const toggleFeature = (table: EditableTable, feature: string) => {
    const hasFeature = table.features.includes(feature)
    const nextFeatures = hasFeature ? table.features.filter((item) => item !== feature) : [...table.features, feature]
    updateTable(table.localId, { features: nextFeatures })
  }

  const handleColorSelect = (table: EditableTable, color: string) => {
    updateTable(table.localId, { color })
  }

  const handleShapeChange = (table: EditableTable, shape: TableShape) => {
    const defaults = shapeDefaults[shape] ?? shapeDefaults.round
    const widthRatio = clamp(defaults.width / DEFAULT_CANVAS_WIDTH, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
    const heightRatio = clamp(defaults.height / DEFAULT_CANVAS_HEIGHT, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
    updateTable(table.localId, { shape, width: widthRatio, height: heightRatio, rotation: 0 })
  }

  const canvasLegend = (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex h-2 w-2 rounded-full bg-primary"></span> Drag & drop to reposition
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex h-2 w-2 rounded-sm border border-gray-300 bg-white"></span> Drag handles to resize
      </span>
      <span>Rotate and fine-tune in the detail panel</span>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Floor builder</CardTitle>
        <CardDescription>
          Craft a high-fidelity map of your dining room. Drag, resize, rotate, and tag tables with unmatched precision to delight your front-of-house team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 lg:space-y-10">
        <div className="relative">
          <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-6 lg:pr-[420px]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Virtual floor</p>
                <p className="text-sm text-gray-600">Drag tables, resize footprints, and mirror the flow of your actual service.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SHAPE_PRESETS.map(({ value, label, Icon }) => (
                  <Button
                    key={value}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 rounded-full border-gray-200 bg-white px-3 py-1 text-xs text-gray-600 hover:border-primary hover:text-primary"
                    onClick={() => handleAddTable(value)}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            <div
              ref={canvasRef}
              className="table-builder-canvas relative mt-6 h-[560px] w-full overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-slate-50 to-slate-100"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,#e5e7eb_1px,transparent_0)] opacity-70" style={{ backgroundSize: '40px 40px' }} />
              <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/60 shadow-inner" />
              {editableTables.filter((table) => table.isActive).map((table) => renderTableShape(table))}
              {!editableTables.length && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-gray-500">
                  <p className="font-medium">No tables yet</p>
                  <p className="text-xs">Start by adding a shape above or import from your POS.</p>
                </div>
              )}
            </div>
            <div className="mt-4">{canvasLegend}</div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:gap-6">
                <span>
                  Active tables:{' '}
                  <span className="font-semibold text-gray-900">
                    {activeTableCount}/{editableTables.length}
                  </span>
                </span>
                <span>
                  Total capacity:{' '}
                  <span className="font-semibold text-gray-900">{totalCapacity}</span>
                </span>
                {selectedTable ? (
                  <span>
                    Selected:{' '}
                    <span className="font-semibold text-gray-900">{selectedTable.name}</span>
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditableTables([])}>
                  Clear floor
                </Button>
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? 'Saving…' : 'Save layout'}
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-lg transition-all lg:absolute lg:top-6 lg:right-6 lg:mt-0 lg:w-[360px] lg:bg-white/95 lg:backdrop-blur">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Table details</h3>
                {selectedTable ? (
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-gray-500 hover:text-primary" onClick={() => handleDuplicateTable(selectedTable)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-gray-500 hover:text-red-500"
                      onClick={() => selectedTable && handleDeleteTable(selectedTable.localId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              {!selectedTable ? (
                <p className="mt-3 text-sm text-gray-500">Select a table from the canvas to reveal granular controls.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3">
                    <div>
                      <Label className="text-xs uppercase text-gray-500">Table name</Label>
                      <Input value={selectedTable.name} onChange={(event) => updateTable(selectedTable.localId, { name: event.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs uppercase text-gray-500">Capacity</Label>
                      <Input
                        type="number"
                        min={1}
                        value={selectedTable.capacity}
                        onChange={(event) => updateTable(selectedTable.localId, { capacity: Number(event.target.value) || 1 })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div>
                        <p className="text-xs uppercase text-gray-500">Active</p>
                        <p className="text-sm text-gray-700">Include in booking flow</p>
                      </div>
                      <Switch
                        checked={selectedTable.isActive}
                        onCheckedChange={(value) => updateTable(selectedTable.localId, { isActive: value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-gray-500">Shape</Label>
                    <div className="flex flex-wrap gap-2">
                      {SHAPE_PRESETS.map(({ value, label, Icon }) => {
                        const isActive = selectedTable.shape === value
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                              isActive ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary'
                            }`}
                            onClick={() => handleShapeChange(selectedTable, value)}
                          >
                            <Icon className="h-3 w-3" />
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-gray-500">Zone</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {ZONES.map(({ value, label }) => {
                        const isActive = selectedTable.zone === value
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                              isActive ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary'
                            }`}
                            onClick={() => updateTable(selectedTable.localId, { zone: value })}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-gray-500">Signature color</Label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_PRESETS.map(({ value, label }) => {
                        const isActive = selectedTable.color === value
                        return (
                          <button
                            key={value}
                            type="button"
                            title={label}
                            className={`relative h-8 w-8 rounded-full border-2 transition ${isActive ? 'border-primary ring-2 ring-primary/40' : 'border-white shadow'}`}
                            style={{ backgroundColor: value }}
                            onClick={() => handleColorSelect(selectedTable, value)}
                          >
                            {isActive ? <span className="absolute inset-2 rounded-full border-2 border-white" /> : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-gray-500">Features</Label>
                    <div className="flex flex-wrap gap-2">
                      {FEATURE_OPTIONS.map(({ value, label }) => {
                        const isActive = selectedTable.features.includes(value)
                        return (
                          <button
                            key={value}
                            type="button"
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              isActive ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 hover:border-primary/40 hover:text-primary'
                            }`}
                            onClick={() => toggleFeature(selectedTable, value)}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs uppercase text-gray-500">Rotation</Label>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary"
                        onClick={() => updateTable(selectedTable.localId, { rotation: 0 })}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={selectedTable.rotation}
                      onChange={(event) => updateTable(selectedTable.localId, { rotation: Number(event.target.value) })}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs text-gray-500">{Math.round(selectedTable.rotation)}°</p>
                  </div>

                  <div>
                    <Label className="text-xs uppercase text-gray-500">Special notes</Label>
                    <Textarea
                      value={selectedTable.notes ?? ''}
                      onChange={(event) => updateTable(selectedTable.localId, { notes: event.target.value })}
                      placeholder="Mention sight lines, server ownership, or ambience tips."
                    />
                  </div>
                </div>
              )}
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/80 p-5 text-xs text-gray-600">
          <p className="font-semibold text-gray-800">Expert tip</p>
          <p className="mt-1">
            Assign colors and zones to match how your team speaks on the floor. Servers can now cross-reference reservations with a single glance,
            reducing handovers and double-sat mishaps.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

