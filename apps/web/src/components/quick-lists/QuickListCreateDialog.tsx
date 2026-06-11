import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectTrigger } from '../ui/select'
import { Badge } from '../ui/badge'
import { Search, Package, Plus, X, Clock, Calendar, CheckCircle, ShoppingCart } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function QuickListCreateDialog(props: any) {
  const {
    showCreateDialog,
    setShowCreateDialog,
    newListName,
    setNewListName,
    newListDescription,
    setNewListDescription,
    handleCreateList,
  } = props

  return (
    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Quick List</DialogTitle>
          <DialogDescription>
            Create a new quick list for recurring orders. You can add products after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">List Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Weekly Produce, Daily Essentials"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of this list..."
              value={newListDescription}
              onChange={(e) => setNewListDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
            <p className="text-sm text-[var(--brand-mid)]">
              💡 <strong>Tip:</strong> After creating the list, you can add products and then
              quickly reorder them anytime!
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateList} disabled={!newListName.trim()}>
            Create List
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
