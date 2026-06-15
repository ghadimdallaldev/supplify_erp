import { useState } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Plus, Upload, Package, Trash2, History, Calendar, BarChart3 } from 'lucide-react'
import { useGetEntitlementsQuery } from '../services/api'
import { toast } from 'sonner'
import { formatNumber } from '../utils/format'
import { featureEnabled } from '../lib/planLimits'
import { ReorderAssistancePanel } from '../components/inventory/ReorderAssistancePanel'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { LazyTabMount } from '../components/LazyTabMount'
import { InventoryTabLoading } from '../components/restaurant/inventory/inventoryShared'
import {
  LazyExpiryTab,
  LazyHistoryTab,
  LazyInventoryTab,
  LazyTotalsTab,
  LazyWasteTab,
} from '../components/restaurant/inventory/lazyRestaurantInventoryTabs'

export function RestaurantInventoryPage() {
  const [activeTab, setActiveTab] = useState('inventory')
  const [showAddProductDialog, setShowAddProductDialog] = useState(false)
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [addQuantity, setAddQuantity] = useState('')
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null)
  const [wastePreselectProductId, setWastePreselectProductId] = useState<string | null>(null)

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const wasteTrackingEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.waste_tracking
  )
  const smartReorderEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.smart_reorder
  )

  const navigateToWaste = (productId: string) => {
    setWastePreselectProductId(productId)
    setActiveTab('waste')
  }

  return (
    <RequirePermission permission="INVENTORY_VIEW" title="inventory">
      <PageShell className="space-y-6" data-testid="restaurant-inventory-page">
        <PageHeader
          title="Inventory"
          description="Track stock levels, waste, expiry, and movement across your kitchen."
          actions={
            <>
              <Button
                onClick={() => setShowBulkUploadDialog(true)}
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
              <Button onClick={() => setShowAddProductDialog(true)} className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </>
          }
        />

        {smartReorderEnabled && (
          <div id="reorder-assistance">
            <ReorderAssistancePanel />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="tabs-scroll h-auto w-full justify-start gap-1 rounded-lg p-1 sm:w-auto">
            <TabsTrigger value="inventory" className="gap-1.5 text-xs sm:text-sm">
              <Package className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Stock
            </TabsTrigger>
            {wasteTrackingEnabled ? (
              <TabsTrigger value="waste" className="gap-1.5 text-xs sm:text-sm">
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Waste
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
              History
            </TabsTrigger>
            <TabsTrigger value="expiry" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Expiry
            </TabsTrigger>
            <TabsTrigger value="totals" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Totals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-6">
            <LazyTabMount
              tab="inventory"
              selectedTab={activeTab}
              fallback={<InventoryTabLoading />}
            >
              <LazyInventoryTab
                wasteTrackingEnabled={wasteTrackingEnabled}
                onNavigateToWaste={navigateToWaste}
              />
            </LazyTabMount>
          </TabsContent>

          {wasteTrackingEnabled ? (
            <TabsContent value="waste" className="space-y-6">
              <LazyTabMount tab="waste" selectedTab={activeTab} fallback={<InventoryTabLoading />}>
                <LazyWasteTab
                  preselectedProductId={wastePreselectProductId}
                  onPreselectConsumed={() => setWastePreselectProductId(null)}
                />
              </LazyTabMount>
            </TabsContent>
          ) : null}

          <TabsContent value="expiry" className="space-y-6">
            <LazyTabMount tab="expiry" selectedTab={activeTab} fallback={<InventoryTabLoading />}>
              <LazyExpiryTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <LazyTabMount tab="history" selectedTab={activeTab} fallback={<InventoryTabLoading />}>
              <LazyHistoryTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="totals" className="space-y-6">
            <LazyTabMount tab="totals" selectedTab={activeTab} fallback={<InventoryTabLoading />}>
              <LazyTotalsTab />
            </LazyTabMount>
          </TabsContent>
        </Tabs>

        <Dialog open={showAddProductDialog} onOpenChange={setShowAddProductDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Product to Inventory</DialogTitle>
              <DialogDescription>Manually add a product to your inventory</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="product">Select Product</Label>
                <p className="text-sm text-[var(--text-muted)] mb-2">
                  This feature requires API integration with product search
                </p>
                <Input
                  id="product"
                  placeholder="Start typing product name or SKU..."
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="quantity">Initial Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  placeholder="Enter quantity"
                />
              </div>

              <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
                <p className="text-sm text-[var(--brand-mid)]">
                  <strong>Tip:</strong> You can also add products by receiving orders or importing
                  from a CSV file.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddProductDialog(false)
                  setSelectedProductId('')
                  setAddQuantity('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  toast('Manual product addition coming soon')
                  setShowAddProductDialog(false)
                }}
                disabled={!selectedProductId || !addQuantity}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showBulkUploadDialog} onOpenChange={setShowBulkUploadDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Bulk Upload Inventory</DialogTitle>
              <DialogDescription>Import inventory items from a CSV or Excel file</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="file">Upload File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => setBulkUploadFile(e.target.files?.[0] || null)}
                />
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  Accepted formats: CSV, Excel (.xlsx)
                </p>
              </div>

              <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
                <p className="text-sm text-[var(--brand-mid)]">
                  <strong>CSV Format Example:</strong>
                  <br />
                  Product SKU,Quantity,Notes
                  <br />
                  TOM-001,50,Weekly supply
                  <br />
                  LET-001,30,Fresh produce
                </p>
              </div>

              {bulkUploadFile && (
                <div className="border rounded-md p-3 bg-[var(--brand-ultra)]">
                  <p className="text-sm font-medium text-[var(--text-mid)]">
                    Selected: {bulkUploadFile.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Size: {formatNumber(bulkUploadFile.size / 1024, { maximumFractionDigits: 2 })}{' '}
                    KB
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkUploadDialog(false)
                  setBulkUploadFile(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  toast.success('Bulk upload feature coming soon')
                  setShowBulkUploadDialog(false)
                }}
                disabled={!bulkUploadFile}
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </RequirePermission>
  )
}
