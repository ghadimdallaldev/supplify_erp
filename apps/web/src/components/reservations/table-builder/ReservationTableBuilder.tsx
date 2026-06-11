import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { Rnd } from 'react-rnd'
import type {
  Reservation,
  ReservationTable,
  ReservationTableShape,
  ReservationTableZone,
} from '../../../types'
import { Button } from '../../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Input } from '../../ui/input'
import { Switch } from '../../ui/switch'
import { Label } from '../../ui/label'
import { Badge } from '../../ui/badge'
import { Textarea } from '../../ui/textarea'
import { findReservationForTable, lookupTableAssignment } from '../../../lib/reservation-tables'
import { useSaveReservationTablesMutation } from '../../../services/reservationsApi'
import { toast } from 'react-hot-toast'
import {
  Circle,
  RectangleHorizontal,
  Square,
  Armchair,
  Sparkles,
  Copy,
  RotateCcw,
  Trash2,
  X,
  ChevronRight,
  Undo2,
  Redo2,
  Plus,
  Minus,
  LayoutGrid,
  Eye,
} from 'lucide-react'
import {
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
  MIN_SIZE_RATIO,
  MAX_SIZE_RATIO,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  GRID_PX,
  MAX_HISTORY,
  SHAPE_PRESETS,
  COLOR_PRESETS,
  ZONES,
  FEATURE_OPTIONS,
  SERVICE_STATUS_STYLES,
  shapeDefaults,
  clamp,
  createLocalId,
  hydrateTables,
  findNextTablePosition,
  type EditableTable,
  type ReservationTableBuilderProps,
  type ServiceInfo,
  type TableShape,
  type TableZone,
} from './tableBuilderShared'
import { ChairLayer } from './ChairLayer'

export function ReservationTableBuilder({
  tables,
  reservations = [],
  defaultLiveView = false,
}: ReservationTableBuilderProps) {
  // Core state
  const [editableTables, setEditableTables] = useState<EditableTable[]>(() => hydrateTables(tables))
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  })
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(true)

  // New feature states
  const [history, setHistory] = useState<EditableTable[][]>([])
  const [future, setFuture] = useState<EditableTable[][]>([])
  const [gridSnap, setGridSnap] = useState(false)
  const [zoom, setZoom] = useState(1.0)
  const [zoneFilter, setZoneFilter] = useState<TableZone | 'all'>('all')
  const [serviceMode, setServiceMode] = useState(defaultLiveView)

  // Refs for keyboard handler (avoid stale closures)
  const editableTablesRef = useRef(editableTables)
  const selectedTableIdRef = useRef(selectedTableId)
  const historyRef = useRef(history)
  const futureRef = useRef(future)
  const gridSnapRef = useRef(gridSnap)

  useEffect(() => {
    editableTablesRef.current = editableTables
  }, [editableTables])
  useEffect(() => {
    selectedTableIdRef.current = selectedTableId
  }, [selectedTableId])
  useEffect(() => {
    historyRef.current = history
  }, [history])
  useEffect(() => {
    futureRef.current = future
  }, [future])
  useEffect(() => {
    gridSnapRef.current = gridSnap
  }, [gridSnap])

  const [saveTables, { isLoading }] = useSaveReservationTablesMutation()

  // ── Sync from prop ──────────────────────────────────────────────────────────
  useEffect(() => {
    setEditableTables(hydrateTables(tables))
    setHistory([])
    setFuture([])
  }, [tables])

  // ── Auto-select first table ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedTableId && editableTables.length) {
      setSelectedTableId(editableTables[0].localId)
      return
    }
    if (selectedTableId && !editableTables.some((t) => t.localId === selectedTableId)) {
      setSelectedTableId(editableTables[0]?.localId ?? null)
    }
  }, [editableTables, selectedTableId])

  // ── ResizeObserver (on outer canvas div) ────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return
    const element = canvasRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setCanvasSize({
        width: entry.contentRect.width || DEFAULT_CANVAS_WIDTH,
        height: DEFAULT_CANVAS_HEIGHT, // always use the logical constant, never the DOM height
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // ── History helpers ─────────────────────────────────────────────────────────
  const pushHistory = useCallback((snapshot: EditableTable[]) => {
    setHistory((prev) => {
      const next = [...prev, snapshot]
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next
    })
    setFuture([])
  }, [])

  const pushHistoryRef = useRef(pushHistory)
  useEffect(() => {
    pushHistoryRef.current = pushHistory
  }, [pushHistory])

  const handleUndo = useCallback(() => {
    const h = historyRef.current
    const cur = editableTablesRef.current
    if (!h.length) return
    const snapshot = h[h.length - 1]
    setHistory(h.slice(0, -1))
    setFuture((f) => [cur, ...f.slice(0, MAX_HISTORY - 1)])
    setEditableTables(snapshot)
  }, [])

  const handleRedo = useCallback(() => {
    const f = futureRef.current
    const cur = editableTablesRef.current
    if (!f.length) return
    const snapshot = f[0]
    setFuture(f.slice(1))
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), cur])
    setEditableTables(snapshot)
  }, [])

  const handleUndoRef = useRef(handleUndo)
  const handleRedoRef = useRef(handleRedo)
  useEffect(() => {
    handleUndoRef.current = handleUndo
  }, [handleUndo])
  useEffect(() => {
    handleRedoRef.current = handleRedo
  }, [handleRedo])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  const handleDeleteTableRef = useRef<(localId: string) => void>(() => {})
  const handleDuplicateTableRef = useRef<(table: EditableTable) => void>(() => {})

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return

      const currentTables = editableTablesRef.current
      const currentSelected = selectedTableIdRef.current

      if (e.key === 'Escape') {
        setSelectedTableId(null)
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && currentSelected) {
        e.preventDefault()
        pushHistoryRef.current(currentTables)
        handleDeleteTableRef.current(currentSelected)
        return
      }

      if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        const table = currentTables.find((t) => t.localId === currentSelected)
        if (table) {
          pushHistoryRef.current(currentTables)
          handleDuplicateTableRef.current(table)
        }
        return
      }

      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        handleUndoRef.current()
        return
      }

      if (
        (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault()
        handleRedoRef.current()
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // ── Grid snap helper ────────────────────────────────────────────────────────
  const snapPx = (px: number) => (gridSnapRef.current ? Math.round(px / GRID_PX) * GRID_PX : px)

  // ── Zoom helpers ────────────────────────────────────────────────────────────
  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))
  const zoomReset = () => setZoom(1.0)

  const tableAssignmentMap = useMemo((): Map<string, ServiceInfo> => {
    const map = new Map<string, ServiceInfo>()
    for (const table of editableTables) {
      const info = findReservationForTable(table, reservations)
      if (info && table.id) {
        map.set(table.id, {
          status: info.status,
          customerName: info.customerName,
          partySize: info.partySize,
        })
      }
    }
    return map
  }, [editableTables, reservations])

  // ── Derived stats ───────────────────────────────────────────────────────────
  const totalCapacity = useMemo(
    () =>
      editableTables.filter((t) => t.isActive).reduce((sum, t) => sum + Number(t.capacity || 0), 0),
    [editableTables]
  )
  const activeTableCount = useMemo(
    () => editableTables.filter((t) => t.isActive).length,
    [editableTables]
  )
  const occupiedCount = useMemo(
    () =>
      editableTables.filter((t) => t.id && lookupTableAssignment(tableAssignmentMap, t.id)).length,
    [editableTables, tableAssignmentMap]
  )

  const selectedTable = useMemo(
    () => editableTables.find((t) => t.localId === selectedTableId) ?? null,
    [editableTables, selectedTableId]
  )

  // ── Table mutations ─────────────────────────────────────────────────────────
  const updateTable = (localId: string, updates: Partial<EditableTable>) => {
    setEditableTables((prev) =>
      prev.map((t) => {
        if (t.localId !== localId) return t
        const next = { ...t, ...updates }
        next.width = clamp(next.width, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
        next.height = clamp(next.height, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
        next.x = clamp(next.x, 0, 1 - next.width)
        next.y = clamp(next.y, 0, 1 - next.height)
        next.rotation = ((next.rotation % 360) + 360) % 360
        return next
      })
    )
  }

  const handleAddTable = (shape: TableShape) => {
    pushHistoryRef.current(editableTablesRef.current)
    const defaults = shapeDefaults[shape] ?? shapeDefaults.round
    const widthRatio = clamp(defaults.width / DEFAULT_CANVAS_WIDTH, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
    const heightRatio = clamp(
      defaults.height / DEFAULT_CANVAS_HEIGHT,
      MIN_SIZE_RATIO,
      MAX_SIZE_RATIO
    )

    setEditableTables((prev) => {
      const localId = createLocalId()
      const base = defaults.label
      let suffix = prev.filter((t) => t.name.startsWith(base)).length + 1
      let name = `${base} ${suffix}`
      while (prev.some((t) => t.name === name)) {
        suffix++
        name = `${base} ${suffix}`
      }

      const { x, y } = findNextTablePosition(prev, widthRatio, heightRatio)

      const newTable: EditableTable = {
        localId,
        name,
        capacity:
          shape === 'chef_table' ? 8 : shape === 'rectangle' ? 6 : shape === 'booth' ? 4 : 2,
        branchId: null,
        x,
        y,
        width: widthRatio,
        height: heightRatio,
        rotation: 0,
        shape,
        color:
          COLOR_PRESETS[Math.floor(Math.random() * COLOR_PRESETS.length)]?.value ||
          COLOR_PRESETS[0].value,
        zone: 'main',
        features: [],
        isActive: true,
      }
      setSelectedTableId(localId)
      return [...prev, newTable]
    })
  }

  const handleDuplicateTable = useCallback((table: EditableTable) => {
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
        features: [...table.features],
      }
      setSelectedTableId(localId)
      return [...prev, duplicate]
    })
  }, [])

  const handleDeleteTable = useCallback((localId: string) => {
    setEditableTables((prev) => prev.filter((t) => t.localId !== localId))
  }, [])

  // Keep refs updated
  useEffect(() => {
    handleDeleteTableRef.current = handleDeleteTable
  }, [handleDeleteTable])
  useEffect(() => {
    handleDuplicateTableRef.current = handleDuplicateTable
  }, [handleDuplicateTable])

  const toggleFeature = (table: EditableTable, feature: string) => {
    const next = table.features.includes(feature)
      ? table.features.filter((f) => f !== feature)
      : [...table.features, feature]
    updateTable(table.localId, { features: next })
  }

  const handleShapeChange = (table: EditableTable, shape: TableShape) => {
    const defaults = shapeDefaults[shape] ?? shapeDefaults.round
    updateTable(table.localId, {
      shape,
      width: clamp(defaults.width / DEFAULT_CANVAS_WIDTH, MIN_SIZE_RATIO, MAX_SIZE_RATIO),
      height: clamp(defaults.height / DEFAULT_CANVAS_HEIGHT, MIN_SIZE_RATIO, MAX_SIZE_RATIO),
      rotation: 0,
    })
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      const payload = editableTables.map((t) => ({
        id: t.id,
        name: t.name,
        capacity: t.capacity,
        branchId: t.branchId || undefined,
        position: { x: Number(t.x.toFixed(4)), y: Number(t.y.toFixed(4)) },
        isActive: t.isActive,
        layout: {
          shape: t.shape,
          color: t.color,
          zone: t.zone,
          features: t.features,
          notes: t.notes,
          rotation: t.rotation,
          widthRatio: Number(t.width.toFixed(4)),
          heightRatio: Number(t.height.toFixed(4)),
          width: Math.round(t.width * DEFAULT_CANVAS_WIDTH),
          height: Math.round(t.height * DEFAULT_CANVAS_HEIGHT),
        },
      }))
      await saveTables({ tables: payload }).unwrap()
      toast.success('Tables saved')
    } catch {
      toast.error('Failed to save tables')
    }
  }

  // ── Canvas pixel dimensions ─────────────────────────────────────────────────
  const displayW = canvasSize.width * zoom
  const displayH = canvasSize.height * zoom

  // ── Render table on canvas ──────────────────────────────────────────────────
  const renderTableShape = (table: EditableTable) => {
    const isSelected = table.localId === selectedTableId
    const widthPx = table.width * displayW
    const heightPx = table.height * displayH
    const xPx = table.x * displayW
    const yPx = table.y * displayH

    const isFiltered =
      zoneFilter !== 'all' && table.zone !== zoneFilter && table.localId !== selectedTableId

    // Inactive: dimmed, not draggable/resizable
    const isInactive = !table.isActive
    // In service mode: no drag/resize
    const disableDrag = isInactive || serviceMode || isFiltered
    const disableResize = isInactive || serviceMode

    const opacity = isInactive ? 0.3 : isFiltered ? 0.2 : 1

    const borderRadius =
      table.shape === 'round'
        ? '9999px'
        : table.shape === 'square'
          ? '24px'
          : table.shape === 'booth'
            ? '32px 32px 12px 12px'
            : '18px'

    let bgColor = `${table.color}20`
    let borderColor = 'rgba(255,255,255,0.8)'
    const serviceInfo =
      findReservationForTable(table, reservations) ??
      lookupTableAssignment(tableAssignmentMap, table.id)

    if (serviceInfo) {
      const key = serviceInfo.status ?? 'available'
      const style = SERVICE_STATUS_STYLES[key] ?? SERVICE_STATUS_STYLES.available
      if (serviceMode) {
        bgColor = style.bg
        borderColor = style.border
      } else {
        bgColor = 'color-mix(in srgb, var(--brand) 12%, white)'
        borderColor = 'var(--brand-mid)'
      }
    } else if (serviceMode) {
      const style = SERVICE_STATUS_STYLES.available
      bgColor = style.bg
      borderColor = style.border
    }

    return (
      <Rnd
        key={table.localId}
        size={{ width: widthPx, height: heightPx }}
        position={{ x: xPx, y: yPx }}
        bounds="parent"
        onDragStart={() => setSelectedTableId(table.localId)}
        onDragStop={(_, data) => {
          pushHistoryRef.current(editableTablesRef.current)
          const nextX = clamp(snapPx(data.x) / displayW, 0, 1 - table.width)
          const nextY = clamp(snapPx(data.y) / displayH, 0, 1 - table.height)
          updateTable(table.localId, { x: nextX, y: nextY })
        }}
        onResizeStop={(_, __, ref, ___, position) => {
          pushHistoryRef.current(editableTablesRef.current)
          const nextWidth = clamp(ref.offsetWidth / displayW, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
          const nextHeight = clamp(ref.offsetHeight / displayH, MIN_SIZE_RATIO, MAX_SIZE_RATIO)
          const nextX = clamp(position.x / displayW, 0, 1 - nextWidth)
          const nextY = clamp(position.y / displayH, 0, 1 - nextHeight)
          updateTable(table.localId, { width: nextWidth, height: nextHeight, x: nextX, y: nextY })
        }}
        onClick={() => setSelectedTableId(table.localId)}
        className="group"
        style={{ opacity }}
        enableResizing={!disableResize}
        disableDragging={disableDrag}
      >
        {/* Chair SVG layer — pointer-events none, extends outside table */}
        <ChairLayer
          shape={table.shape}
          capacity={table.capacity}
          widthPx={widthPx}
          heightPx={heightPx}
          color={table.color}
          isActive={table.isActive}
        />

        <div
          className={`relative flex h-full w-full select-none flex-col items-center justify-center border-2 text-xs font-semibold shadow-lg transition ${
            isSelected ? 'ring-2 ring-[var(--brand-mid)]/40' : ''
          }`}
          style={{
            backgroundColor: bgColor,
            color: serviceMode ? borderColor : table.color,
            borderColor: isSelected ? 'var(--brand)' : borderColor,
            borderRadius,
            transform: `rotate(${table.rotation}deg)`,
          }}
        >
          {serviceInfo ? (
            <span
              className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow"
              style={{ backgroundColor: borderColor }}
            >
              {SERVICE_STATUS_STYLES[serviceInfo.status]?.label ?? serviceInfo.status}
            </span>
          ) : null}

          {/* Inactive overlay */}
          {isInactive && (
            <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-gray-200/60 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Inactive
            </span>
          )}

          {serviceInfo ? (
            <>
              <span className="max-w-full truncate rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-[var(--text)] shadow">
                {serviceInfo.customerName}
              </span>
              <span className="mt-1 text-[10px] font-medium text-[var(--text-muted)]">
                {serviceInfo.partySize} guests · {table.name}
              </span>
            </>
          ) : (
            <>
              <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-mid)] shadow">
                {table.name}
              </span>
              <span className="mt-1 text-[10px] font-medium text-[var(--text-muted)]">
                {table.capacity} guests
              </span>
            </>
          )}

          <div className="absolute -bottom-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {table.features.slice(0, 3).map((f) => (
              <Badge
                key={f}
                variant="outline"
                className="border-white/60 bg-white/80 text-[9px] font-medium text-[var(--text-muted)]"
              >
                {f.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        </div>
      </Rnd>
    )
  }

  // ── Details panel content ───────────────────────────────────────────────────
  const renderDetailsPanel = () => {
    if (!selectedTable) {
      return (
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          Select a table from the canvas to reveal granular controls.
        </p>
      )
    }

    if (serviceMode) {
      const svcInfo =
        findReservationForTable(selectedTable, reservations) ??
        lookupTableAssignment(tableAssignmentMap, selectedTable.id)
      return (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-[var(--text)]">{selectedTable.name}</p>
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 space-y-1">
            {svcInfo ? (
              <>
                <p className="text-xs text-[var(--text-muted)]">
                  Guest:{' '}
                  <span className="font-semibold text-[var(--text)]">{svcInfo.customerName}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Party size:{' '}
                  <span className="font-semibold text-[var(--text)]">{svcInfo.partySize}</span>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Status:{' '}
                  <span
                    className="font-semibold"
                    style={{ color: SERVICE_STATUS_STYLES[svcInfo.status]?.border }}
                  >
                    {SERVICE_STATUS_STYLES[svcInfo.status]?.label ?? svcInfo.status}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Available — no active reservation</p>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Capacity: {selectedTable.capacity} · Zone:{' '}
            {ZONES.find((z) => z.value === selectedTable.zone)?.label ?? selectedTable.zone}
          </p>
        </div>
      )
    }

    return (
      <div className="mt-4 space-y-4">
        <div className="grid gap-3">
          <div>
            <Label className="text-xs uppercase text-[var(--text-muted)]">Table name</Label>
            <Input
              value={selectedTable.name}
              onChange={(e) => updateTable(selectedTable.localId, { name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs uppercase text-[var(--text-muted)]">Capacity</Label>
            <Input
              type="number"
              min={1}
              value={selectedTable.capacity}
              onChange={(e) =>
                updateTable(selectedTable.localId, { capacity: Number(e.target.value) || 1 })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] px-3 py-2">
            <div>
              <p className="text-xs uppercase text-[var(--text-muted)]">Active</p>
              <p className="text-sm text-[var(--text-mid)]">Include in booking flow</p>
            </div>
            <Switch
              checked={selectedTable.isActive}
              onCheckedChange={(v) => updateTable(selectedTable.localId, { isActive: v })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-[var(--text-muted)]">Shape</Label>
          <div className="flex flex-wrap gap-2">
            {SHAPE_PRESETS.map(({ value, label, Icon }) => {
              const active = selectedTable.shape === value
              return (
                <button
                  key={value}
                  type="button"
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                      : 'border-[var(--app-border)] text-[var(--text-muted)] hover:border-[var(--brand)]/40 hover:text-[var(--brand-mid)]'
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
          <Label className="text-xs uppercase text-[var(--text-muted)]">Zone</Label>
          <div className="grid grid-cols-2 gap-2">
            {ZONES.map(({ value, label, emoji }) => {
              const active = selectedTable.zone === value
              return (
                <button
                  key={value}
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                      : 'border-[var(--app-border)] text-[var(--text-muted)] hover:border-[var(--brand)]/40 hover:text-[var(--brand-mid)]'
                  }`}
                  onClick={() => updateTable(selectedTable.localId, { zone: value })}
                >
                  {emoji} {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-[var(--text-muted)]">Signature color</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map(({ value, label }) => {
              const active = selectedTable.color === value
              return (
                <button
                  key={value}
                  type="button"
                  title={label}
                  className={`relative h-8 w-8 rounded-full border-2 transition ${active ? 'border-[var(--brand)] ring-2 ring-[var(--brand-mid)]/40' : 'border-white shadow'}`}
                  style={{ backgroundColor: value }}
                  onClick={() => updateTable(selectedTable.localId, { color: value })}
                >
                  {active ? (
                    <span className="absolute inset-2 rounded-full border-2 border-white" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-[var(--text-muted)]">Features</Label>
          <div className="flex flex-wrap gap-2">
            {FEATURE_OPTIONS.map(({ value, label }) => {
              const active = selectedTable.features.includes(value)
              return (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    active
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                      : 'border-[var(--app-border)] text-[var(--text-muted)] hover:border-[var(--brand)]/40 hover:text-[var(--brand-mid)]'
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
            <Label className="text-xs uppercase text-[var(--text-muted)]">Rotation</Label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--brand-mid)]"
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
            onChange={(e) =>
              updateTable(selectedTable.localId, { rotation: Number(e.target.value) })
            }
            className="w-full accent-primary"
          />
          <p className="text-xs text-[var(--text-muted)]">{Math.round(selectedTable.rotation)}°</p>
        </div>

        <div>
          <Label className="text-xs uppercase text-[var(--text-muted)]">Special notes</Label>
          <Textarea
            value={selectedTable.notes ?? ''}
            onChange={(e) => updateTable(selectedTable.localId, { notes: e.target.value })}
            placeholder="Mention sight lines, server ownership, or ambience tips."
          />
        </div>
      </div>
    )
  }

  // ── Legend ──────────────────────────────────────────────────────────────────
  const canvasLegend = (
    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex h-2 w-2 rounded-full bg-[var(--brand)]" /> Drag & drop
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-flex h-2 w-2 rounded-sm border border-[var(--app-border-mid)] bg-[var(--surface)]" />{' '}
        Drag handles to resize
      </span>
      <span>Del/Backspace: delete · Ctrl+D: duplicate · Ctrl+Z/Y: undo/redo</span>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Floor builder</CardTitle>
            <CardDescription className="mt-1">
              {serviceMode
                ? 'Live view: assigned tables show the guest name and status for today’s board.'
                : 'Edit layout mode — turn on Live view to see table assignments from the board above.'}{' '}
              <span className="opacity-60">
                Del: delete · Ctrl+D: duplicate · Ctrl+Z: undo · Ctrl+Y: redo · Esc: deselect
              </span>
            </CardDescription>
          </div>
          <Button
            variant={serviceMode ? 'default' : 'outline'}
            size="sm"
            className={`shrink-0 flex items-center gap-2 rounded-full ${serviceMode ? 'bg-[var(--brand)] text-white hover:bg-[var(--brand-mid)]' : ''}`}
            onClick={() => setServiceMode((v) => !v)}
          >
            <Eye className="h-4 w-4" />
            {serviceMode ? 'Live view' : 'Service mode'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 lg:space-y-10">
        <div className="relative">
          <div className="rounded-3xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] p-6 lg:pr-[420px]">
            {/* Shape add buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  Virtual floor
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  Drag tables, resize footprints, and mirror your actual service.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SHAPE_PRESETS.map(({ value, label, Icon }) => (
                  <Button
                    key={value}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1 rounded-full border-[var(--app-border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--brand-mid)]"
                    onClick={() => handleAddTable(value)}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              {/* Zone filter pills */}
              <div className="flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--surface)] p-1">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${zoneFilter === 'all' ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--brand-mid)]'}`}
                  onClick={() => setZoneFilter('all')}
                >
                  All
                </button>
                {ZONES.map(({ value, emoji, label }) => (
                  <button
                    key={value}
                    type="button"
                    title={label}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${zoneFilter === value ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--brand-mid)]'}`}
                    onClick={() => setZoneFilter((prev) => (prev === value ? 'all' : value))}
                  >
                    {emoji} {label}
                  </button>
                ))}
              </div>

              {/* Right-side controls */}
              <div className="flex items-center gap-2">
                {/* Undo / Redo */}
                <div className="flex items-center gap-0.5 rounded-full border border-[var(--app-border)] bg-[var(--surface)] p-1">
                  <button
                    type="button"
                    title="Undo (Ctrl+Z)"
                    disabled={history.length === 0}
                    className="rounded-full p-1.5 text-[var(--text-muted)] transition hover:text-[var(--brand-mid)] disabled:opacity-30"
                    onClick={handleUndo}
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Redo (Ctrl+Y)"
                    disabled={future.length === 0}
                    className="rounded-full p-1.5 text-[var(--text-muted)] transition hover:text-[var(--brand-mid)] disabled:opacity-30"
                    onClick={handleRedo}
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Snap toggle */}
                <button
                  type="button"
                  title="Grid snap"
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    gridSnap
                      ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                      : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--brand)]/40 hover:text-[var(--brand-mid)]'
                  }`}
                  onClick={() => setGridSnap((v) => !v)}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Snap
                </button>

                {/* Zoom controls */}
                <div className="flex items-center gap-0 rounded-full border border-[var(--app-border)] bg-[var(--surface)] p-1">
                  <button
                    type="button"
                    title="Zoom out"
                    disabled={zoom <= MIN_ZOOM}
                    className="rounded-full p-1.5 text-[var(--text-muted)] transition hover:text-[var(--brand-mid)] disabled:opacity-30"
                    onClick={zoomOut}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Reset zoom"
                    className="min-w-[3.5rem] rounded-full px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--brand-mid)]"
                    onClick={zoomReset}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    title="Zoom in"
                    disabled={zoom >= MAX_ZOOM}
                    className="rounded-full p-1.5 text-[var(--text-muted)] transition hover:text-[var(--brand-mid)] disabled:opacity-30"
                    onClick={zoomIn}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Service mode legend strip */}
            {serviceMode && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--app-border)] bg-white/80 px-4 py-2 text-xs">
                <span className="font-semibold text-[var(--text-mid)]">Live status:</span>
                {Object.entries(SERVICE_STATUS_STYLES).map(([key, { border, label }]) => (
                  <span key={key} className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full border"
                      style={{ backgroundColor: `${border}30`, borderColor: border }}
                    />
                    {label}
                  </span>
                ))}
              </div>
            )}

            {/* ── Canvas OUTER (ResizeObserver, overflow) ── */}
            <div
              ref={canvasRef}
              className="table-builder-canvas relative mt-4 w-full rounded-2xl border border-[var(--app-border)]"
              style={{
                height: 560,
                overflow: zoom > 1 ? 'auto' : 'hidden',
              }}
            >
              {/* ── Canvas INNER (zoomed content) ── */}
              <div
                className="relative bg-gradient-to-br from-white via-[var(--brand-ultra)] to-[var(--brand-ultra)]"
                style={{
                  width: displayW,
                  height: displayH,
                  minWidth: '100%',
                }}
              >
                {/* Background grid */}
                <div
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage: gridSnap
                      ? `linear-gradient(to right, rgba(99,102,241,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.2) 1px, transparent 1px)`
                      : 'radial-gradient(circle at 1px 1px, #e5e7eb 1px, transparent 0)',
                    backgroundSize: `${GRID_PX * zoom}px ${GRID_PX * zoom}px`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/60 shadow-inner" />

                {editableTables.map((table) => renderTableShape(table))}

                {!editableTables.length && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-[var(--text-muted)]">
                    <p className="font-medium">No tables yet</p>
                    <p className="text-xs">Start by adding a shape above.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4">{canvasLegend}</div>

            {/* ── Footer stats row ── */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-2 text-sm text-[var(--text-muted)] sm:flex-row sm:items-center sm:gap-6">
                <span>
                  Active tables:{' '}
                  <span className="font-semibold text-[var(--text)]">
                    {activeTableCount}/{editableTables.length}
                  </span>
                </span>
                <span>
                  Total capacity:{' '}
                  <span className="font-semibold text-[var(--text)]">{totalCapacity}</span>
                </span>
                {occupiedCount > 0 ? (
                  <span>
                    Assigned on floor:{' '}
                    <span className="font-semibold text-[var(--brand-mid)]">
                      {occupiedCount} / {activeTableCount}
                    </span>
                  </span>
                ) : null}
                {selectedTable && (
                  <span>
                    Selected:{' '}
                    <span className="font-semibold text-[var(--text)]">{selectedTable.name}</span>
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    pushHistoryRef.current(editableTables)
                    setEditableTables([])
                  }}
                >
                  Clear floor
                </Button>
                <Button onClick={handleSave} disabled={isLoading}>
                  {isLoading ? 'Saving…' : 'Save layout'}
                </Button>
              </div>
            </div>
          </div>

          {/* ── Details panel ── */}
          {isDetailsOpen ? (
            <div className="mt-6 rounded-2xl border border-[var(--app-border)] bg-[var(--surface)] p-5 shadow-lg transition-all lg:absolute lg:top-6 lg:right-6 lg:mt-0 lg:w-[360px] lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:bg-white/95 lg:backdrop-blur">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text)]">Table details</h3>
                <div className="flex gap-2">
                  {selectedTable && !serviceMode && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--brand-mid)]"
                        onClick={() => {
                          pushHistoryRef.current(editableTables)
                          handleDuplicateTable(selectedTable)
                        }}
                        aria-label="Duplicate table"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-[var(--text-muted)] hover:text-[var(--red)]"
                        onClick={() => {
                          pushHistoryRef.current(editableTables)
                          handleDeleteTable(selectedTable.localId)
                        }}
                        aria-label="Delete table"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-[var(--text-muted)]"
                    onClick={() => setIsDetailsOpen(false)}
                    aria-label="Hide table details"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {renderDetailsPanel()}
            </div>
          ) : (
            <div className="mt-6 flex justify-end lg:absolute lg:top-6 lg:right-6 lg:mt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDetailsOpen(true)}
                className="flex items-center gap-2 rounded-full border-[var(--app-border-mid)] text-[var(--text-muted)] hover:text-[var(--brand-mid)]"
              >
                <ChevronRight className="h-4 w-4" />
                Show table details
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-dashed border-[var(--app-border)] bg-white/80 p-5 text-xs text-[var(--text-muted)]">
          <p className="font-semibold text-[var(--text)]">Expert tip</p>
          <p className="mt-1">
            Assign colors and zones to match how your team speaks on the floor. Servers can now
            cross-reference reservations with a single glance, reducing handovers and double-sat
            mishaps.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
