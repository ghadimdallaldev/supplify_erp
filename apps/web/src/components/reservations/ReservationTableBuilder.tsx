import { useMemo, useState } from 'react'
import type { ReservationTable } from '../../types'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { Label } from '../ui/label'
import { useSaveReservationTablesMutation } from '../../services/reservationsApi'
import { toast } from 'react-hot-toast'

interface ReservationTableBuilderProps {
  tables: ReservationTable[]
}

interface EditableTable {
  id?: string
  name: string
  capacity: number
  branchId?: string | null
  layout?: Record<string, unknown>
  position?: { x?: number; y?: number }
  isActive?: boolean
}

export function ReservationTableBuilder({ tables }: ReservationTableBuilderProps) {
  const [editableTables, setEditableTables] = useState<EditableTable[]>(
    tables.map((table) => ({
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      branchId: table.branch_id || null,
      layout: table.layout || {},
      position: (table.position as { x?: number; y?: number }) || { x: 0, y: 0 },
      isActive: table.is_active,
    })),
  )

  const [saveTables, { isLoading }] = useSaveReservationTablesMutation()

  const totalCapacity = useMemo(() => editableTables.reduce((sum, table) => sum + Number(table.capacity || 0), 0), [editableTables])

  const handleChange = (index: number, field: keyof EditableTable, value: string | number | boolean) => {
    setEditableTables((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        [field]: value,
      }
      return updated
    })
  }

  const handlePositionChange = (index: number, axis: 'x' | 'y', value: number) => {
    setEditableTables((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        position: {
          ...(updated[index].position || {}),
          [axis]: value,
        },
      }
      return updated
    })
  }

  const addTable = () => {
    setEditableTables((prev) => [
      ...prev,
      {
        name: `Table ${prev.length + 1}`,
        capacity: 2,
        position: { x: Math.round(Math.random() * 6), y: Math.round(Math.random() * 4) },
        isActive: true,
      },
    ])
  }

  const handleSave = async () => {
    try {
      await saveTables({ tables: editableTables }).unwrap()
      toast.success('Tables saved')
    } catch (error) {
      toast.error('Failed to save tables')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Floor builder</CardTitle>
        <CardDescription>Recreate your dining room to manage reservations visually. Drag coordinates to match real-world placement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-6">
          <p className="mb-4 text-xs uppercase tracking-wide text-gray-500">Virtual floor</p>
          <div className="relative h-64 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {editableTables
              .filter((table) => table.isActive !== false)
              .map((table, index) => {
                const x = ((table.position?.x ?? 0) % 10) / 10
                const y = ((table.position?.y ?? 0) % 6) / 6
                return (
                  <div
                    key={table.id || index}
                    className="absolute flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-xs font-semibold text-primary shadow-md transition hover:scale-105"
                    style={{
                      left: `${Math.min(Math.max(x, 0), 0.9) * 100}%`,
                      top: `${Math.min(Math.max(y, 0), 0.9) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <span>{table.name}</span>
                    <span className="text-[10px] font-medium text-primary/70">{table.capacity} seats</span>
                  </div>
                )
              })}
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary"></span>
            Drag coordinates below to fine-tune placement. Coordinates reflect metres across your dining room grid.
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Active tables: {editableTables.filter((table) => table.isActive !== false).length} • Total capacity:{' '}
            <span className="font-semibold text-gray-900">{totalCapacity}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addTable}>
              + Add table
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Saving…' : 'Save layout'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          {editableTables.map((table, index) => (
            <div key={table.id || index} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="grid gap-2 md:grid-cols-3 md:gap-4">
                  <div>
                    <Label className="text-xs uppercase text-gray-500">Table name</Label>
                    <Input value={table.name} onChange={(event) => handleChange(index, 'name', event.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-gray-500">Capacity</Label>
                    <Input
                      type="number"
                      min={1}
                      value={table.capacity}
                      onChange={(event) => handleChange(index, 'capacity', Number(event.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={table.isActive !== false} onCheckedChange={(value) => handleChange(index, 'isActive', value)} />
                    <span className="text-xs text-gray-600">Active</span>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2 md:gap-4">
                  <div>
                    <Label className="text-xs uppercase text-gray-500">Position X</Label>
                    <Input
                      type="number"
                      value={table.position?.x ?? 0}
                      onChange={(event) => handlePositionChange(index, 'x', Number(event.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-gray-500">Position Y</Label>
                    <Input
                      type="number"
                      value={table.position?.y ?? 0}
                      onChange={(event) => handlePositionChange(index, 'y', Number(event.target.value))}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

