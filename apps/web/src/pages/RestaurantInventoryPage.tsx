import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Plus, Upload, Package, Trash2, History, Calendar, BarChart3 } from 'lucide-react'
import { useGetEntitlementsQuery } from '../services/api'
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
import { ensureNamespace } from '../i18n'

export function RestaurantInventoryPage() {
  const { t } = useTranslation('inventory')

  useEffect(() => {
    void ensureNamespace('inventory')
  }, [])
  const [activeTab, setActiveTab] = useState('inventory')
  const [showAddProductDialog, setShowAddProductDialog] = useState(false)
  const [showBulkUploadDialog, setShowBulkUploadDialog] = useState(false)
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
      <PageShell maxWidth="wide" data-testid="restaurant-inventory-page">
        <PageHeader
          title={t('page.title')}
          description={t('page.description')}
          actions={
            <>
              <Button
                onClick={() => setShowBulkUploadDialog(true)}
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('page.bulkUpload')}
              </Button>
              <Button onClick={() => setShowAddProductDialog(true)} className="flex-1 sm:flex-none">
                <Plus className="h-4 w-4 mr-2" />
                {t('page.addProduct')}
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
              {t('page.tabs.stock')}
            </TabsTrigger>
            {wasteTrackingEnabled ? (
              <TabsTrigger value="waste" className="gap-1.5 text-xs sm:text-sm">
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {t('page.tabs.waste')}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="history" className="gap-1.5 text-xs sm:text-sm">
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.history')}
            </TabsTrigger>
            <TabsTrigger value="expiry" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.expiry')}
            </TabsTrigger>
            <TabsTrigger value="totals" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.totals')}
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
                reorderAssistAvailable={smartReorderEnabled}
                onNavigateToWaste={navigateToWaste}
                showAddDialog={showAddProductDialog}
                onShowAddDialogChange={setShowAddProductDialog}
                showBulkDialog={showBulkUploadDialog}
                onShowBulkDialogChange={setShowBulkUploadDialog}
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
      </PageShell>
    </RequirePermission>
  )
}
