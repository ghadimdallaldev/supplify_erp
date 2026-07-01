import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCreateConsumerMenuCategoryMutation,
  useCreateConsumerMenuItemMutation,
  useCreateConsumerModifierGroupMutation,
  useCreateConsumerModifierOptionMutation,
  useCreateConsumerDeliveryZoneMutation,
  useDeleteConsumerDeliveryZoneMutation,
  useDeleteConsumerMenuItemMutation,
  useDeleteConsumerModifierGroupMutation,
  useDeleteConsumerModifierOptionMutation,
  useGetConsumerFulfillmentAdminQuery,
  useGetConsumerMenuAdminQuery,
  useUpdateConsumerFulfillmentConfigMutation,
  useUpdateConsumerMenuItemMutation,
  type ConsumerMenuItem,
} from '../../services/consumerApi'
import { useGetRestaurantMeQuery, useGetPresignedUrlMutation } from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Skeleton } from '../../components/ui/skeleton'
import { Switch } from '../../components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { RequirePermission } from '../../components/RequirePermission'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { EmptyState } from '../../components/ui/empty-state'
import { LogoUpload } from '../../components/LogoUpload'
import { MenuBulkImportPanel } from '../../components/consumer/MenuBulkImportPanel'
import { formatPrice } from '../../utils/format'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  LayoutList,
  Link2,
  List,
  Pencil,
  Trash2,
} from 'lucide-react'
import { copyToClipboard } from '../../utils/clipboard'
import { cn } from '../../lib/utils'
import { ensureNamespace } from '../../i18n'
import { usePermissions } from '../../hooks/usePermissions'

export function MenuAdminPage() {
  const { t } = useTranslation('consumer')
  const { can, canAny } = usePermissions()
  const canEditMenu = canAny('CATALOG_EDIT', 'CATALOG_MANAGE')
  const canEditFulfillment = canAny('SETTINGS_EDIT', 'SETTINGS_MANAGE')
  const canViewMenu = can('CATALOG_VIEW')
  const canViewFulfillment = can('SETTINGS_VIEW')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const { data: me } = useGetRestaurantMeQuery()
  const [getPresignedUrl] = useGetPresignedUrlMutation()
  const { data, isLoading, refetch } = useGetConsumerMenuAdminQuery()
  const [createCategory, { isLoading: creatingCategory }] = useCreateConsumerMenuCategoryMutation()
  const [createItem, { isLoading: creatingItem }] = useCreateConsumerMenuItemMutation()
  const [updateItem, { isLoading: updatingItem }] = useUpdateConsumerMenuItemMutation()
  const [deleteItem] = useDeleteConsumerMenuItemMutation()
  const [createModifierGroup, { isLoading: creatingGroup }] =
    useCreateConsumerModifierGroupMutation()
  const [deleteModifierGroup] = useDeleteConsumerModifierGroupMutation()
  const [createModifierOption, { isLoading: creatingOption }] =
    useCreateConsumerModifierOptionMutation()
  const [deleteModifierOption] = useDeleteConsumerModifierOptionMutation()

  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' })
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    name: '',
    basePrice: '',
    description: '',
    imageUrl: null as string | null,
  })
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    basePrice: '',
    description: '',
    isAvailable: true,
    imageUrl: null as string | null,
  })
  const [modifierGroupForm, setModifierGroupForm] = useState({
    menuItemId: '',
    name: '',
    minSelections: '0',
    maxSelections: '1',
    isRequired: false,
  })
  const [optionForms, setOptionForms] = useState<
    Record<string, { name: string; priceDelta: string }>
  >({})

  const [adminTab, setAdminTab] = useState('menu')
  const [compactView, setCompactView] = useState(true)
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({})
  const [fulfillmentBranchId, setFulfillmentBranchId] = useState('')
  const [fulfillmentForm, setFulfillmentForm] = useState({
    deliveryEnabled: false,
    takeawayEnabled: true,
    dineInEnabled: true,
    minOrderAmount: '0',
    deliveryFee: '0',
    estimatedPrepMinutes: '30',
    liveOrderStart: '12:00',
    liveOrderEnd: '00:00',
    allowPreordersOutsideLiveHours: true,
  })
  const [zoneForm, setZoneForm] = useState({
    name: '',
    postcodePrefix: '',
    deliveryFee: '0',
    minOrderAmount: '0',
  })

  const {
    data: fulfillmentData,
    isLoading: loadingFulfillment,
    refetch: refetchFulfillment,
  } = useGetConsumerFulfillmentAdminQuery(undefined, { skip: adminTab !== 'fulfillment' })
  const [updateFulfillment, { isLoading: savingFulfillment }] =
    useUpdateConsumerFulfillmentConfigMutation()
  const [createZone, { isLoading: creatingZone }] = useCreateConsumerDeliveryZoneMutation()
  const [deleteZone] = useDeleteConsumerDeliveryZoneMutation()

  const fulfillmentBranches = useMemo(
    () => fulfillmentData?.branches ?? [],
    [fulfillmentData?.branches]
  )
  const selectedFulfillmentBranch = useMemo(
    () =>
      fulfillmentBranches.find((b) => b.branchId === fulfillmentBranchId) ?? fulfillmentBranches[0],
    [fulfillmentBranches, fulfillmentBranchId]
  )

  useEffect(() => {
    if (!fulfillmentBranchId && fulfillmentBranches.length) {
      setFulfillmentBranchId(fulfillmentBranches[0].branchId)
    }
  }, [fulfillmentBranches, fulfillmentBranchId])

  useEffect(() => {
    if (!selectedFulfillmentBranch) return
    setFulfillmentForm({
      deliveryEnabled: selectedFulfillmentBranch.deliveryEnabled,
      takeawayEnabled: selectedFulfillmentBranch.takeawayEnabled,
      dineInEnabled: selectedFulfillmentBranch.dineInEnabled,
      minOrderAmount: String(selectedFulfillmentBranch.minOrderAmount),
      deliveryFee: String(selectedFulfillmentBranch.deliveryFee),
      estimatedPrepMinutes: String(selectedFulfillmentBranch.estimatedPrepMinutes),
      liveOrderStart: selectedFulfillmentBranch.liveOrderStart ?? '12:00',
      liveOrderEnd: selectedFulfillmentBranch.liveOrderEnd ?? '00:00',
      allowPreordersOutsideLiveHours:
        selectedFulfillmentBranch.allowPreordersOutsideLiveHours ?? true,
    })
  }, [selectedFulfillmentBranch])

  const handleSaveFulfillment = async (event: FormEvent) => {
    event.preventDefault()
    if (!fulfillmentBranchId) return
    try {
      await updateFulfillment({
        branchId: fulfillmentBranchId,
        deliveryEnabled: fulfillmentForm.deliveryEnabled,
        takeawayEnabled: fulfillmentForm.takeawayEnabled,
        dineInEnabled: fulfillmentForm.dineInEnabled,
        minOrderAmount: Number(fulfillmentForm.minOrderAmount),
        deliveryFee: Number(fulfillmentForm.deliveryFee),
        estimatedPrepMinutes: Number(fulfillmentForm.estimatedPrepMinutes),
        liveOrderStart: fulfillmentForm.liveOrderStart,
        liveOrderEnd: fulfillmentForm.liveOrderEnd,
        allowPreordersOutsideLiveHours: fulfillmentForm.allowPreordersOutsideLiveHours,
      }).unwrap()
      toast.success(t('menuAdmin.fulfillmentSaved'))
      refetchFulfillment()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableSaveFulfillment'))
    }
  }

  const handleCreateZone = async (event: FormEvent) => {
    event.preventDefault()
    if (!fulfillmentBranchId || !zoneForm.name.trim()) return
    try {
      await createZone({
        branchId: fulfillmentBranchId,
        name: zoneForm.name.trim(),
        postcodePrefix: zoneForm.postcodePrefix.trim() || undefined,
        deliveryFee: Number(zoneForm.deliveryFee || 0),
        minOrderAmount: Number(zoneForm.minOrderAmount || 0),
      }).unwrap()
      setZoneForm({ name: '', postcodePrefix: '', deliveryFee: '0', minOrderAmount: '0' })
      toast.success(t('menuAdmin.zoneCreated'))
      refetchFulfillment()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableCreateZone'))
    }
  }

  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    if (!window.confirm(t('menuAdmin.confirmDeleteZone', { name: zoneName }))) return
    try {
      await deleteZone(zoneId).unwrap()
      toast.success(t('menuAdmin.zoneDeleted'))
      refetchFulfillment()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableDeleteZone'))
    }
  }

  const slug = me?.restaurant?.slug
  const restaurantId = me?.restaurant?.id ?? ''
  const publicUrl = slug ? `${window.location.origin}/order/${slug}` : ''

  const handleGetPresignedUrl = async (params: {
    fileName: string
    fileType: string
    fileSize?: number
  }) => getPresignedUrl(params).unwrap()

  const handleCreateItemImageUpload = async (imageUrl: string) => {
    setItemForm((f) => ({ ...f, imageUrl: imageUrl || null }))
  }

  const handleEditItemImageUpload = async (imageUrl: string) => {
    setEditForm((f) => ({ ...f, imageUrl: imageUrl || null }))
  }

  const handleCreateCategory = async (event: FormEvent) => {
    event.preventDefault()
    if (!categoryForm.name.trim()) return
    try {
      await createCategory({
        name: categoryForm.name.trim(),
        description: categoryForm.description.trim() || undefined,
      }).unwrap()
      setCategoryForm({ name: '', description: '' })
      toast.success(t('menuAdmin.categoryCreated'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableCreateCategory'))
    }
  }

  const handleCreateItem = async (event: FormEvent) => {
    event.preventDefault()
    if (!itemForm.categoryId || !itemForm.name.trim() || !itemForm.basePrice) return
    try {
      await createItem({
        categoryId: itemForm.categoryId,
        name: itemForm.name.trim(),
        basePrice: Number(itemForm.basePrice),
        description: itemForm.description.trim() || undefined,
        imageUrl: itemForm.imageUrl,
      }).unwrap()
      setItemForm({
        categoryId: itemForm.categoryId,
        name: '',
        basePrice: '',
        description: '',
        imageUrl: null,
      })
      toast.success(t('menuAdmin.itemCreated'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableCreateItem'))
    }
  }

  const startEditItem = (item: ConsumerMenuItem) => {
    setExpandedItemIds((prev) => ({ ...prev, [item.id]: true }))
    setEditingItemId(item.id)
    setEditForm({
      name: item.name,
      basePrice: String(item.base_price),
      description: item.description ?? '',
      isAvailable: item.is_available,
      imageUrl: item.image_url ?? null,
    })
  }

  const handleUpdateItem = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingItemId) return
    try {
      await updateItem({
        id: editingItemId,
        name: editForm.name.trim(),
        basePrice: Number(editForm.basePrice),
        description: editForm.description.trim() || undefined,
        isAvailable: editForm.isAvailable,
        imageUrl: editForm.imageUrl,
      }).unwrap()
      setEditingItemId(null)
      toast.success(t('menuAdmin.itemUpdated'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableUpdateItem'))
    }
  }

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(t('menuAdmin.confirmDeleteItem', { name: itemName }))) return
    try {
      await deleteItem(itemId).unwrap()
      if (editingItemId === itemId) setEditingItemId(null)
      toast.success(t('menuAdmin.itemDeleted'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableDeleteItem'))
    }
  }

  const handleCreateModifierGroup = async (event: FormEvent) => {
    event.preventDefault()
    if (!modifierGroupForm.menuItemId || !modifierGroupForm.name.trim()) return
    try {
      await createModifierGroup({
        menuItemId: modifierGroupForm.menuItemId,
        name: modifierGroupForm.name.trim(),
        minSelections: Number(modifierGroupForm.minSelections),
        maxSelections: Number(modifierGroupForm.maxSelections),
        isRequired: modifierGroupForm.isRequired,
      }).unwrap()
      setModifierGroupForm({
        menuItemId: modifierGroupForm.menuItemId,
        name: '',
        minSelections: '0',
        maxSelections: '1',
        isRequired: false,
      })
      toast.success(t('menuAdmin.modifierGroupCreated'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableCreateModifierGroup'))
    }
  }

  const handleDeleteModifierGroup = async (groupId: string, groupName: string) => {
    if (!window.confirm(t('menuAdmin.confirmDeleteModifierGroup', { name: groupName }))) return
    try {
      await deleteModifierGroup(groupId).unwrap()
      toast.success(t('menuAdmin.modifierGroupDeleted'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableDeleteModifierGroup'))
    }
  }

  const handleCreateModifierOption = async (groupId: string) => {
    const form = optionForms[groupId]
    if (!form?.name.trim()) return
    try {
      await createModifierOption({
        modifierGroupId: groupId,
        name: form.name.trim(),
        priceDelta: Number(form.priceDelta || 0),
      }).unwrap()
      setOptionForms((prev) => ({ ...prev, [groupId]: { name: '', priceDelta: '0' } }))
      toast.success(t('menuAdmin.optionAdded'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableAddOption'))
    }
  }

  const handleDeleteModifierOption = async (optionId: string, optionName: string) => {
    if (!window.confirm(t('menuAdmin.confirmDeleteOption', { name: optionName }))) return
    try {
      await deleteModifierOption(optionId).unwrap()
      toast.success(t('menuAdmin.optionDeleted'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('menuAdmin.unableDeleteOption'))
    }
  }

  const allItems = (data?.categories ?? []).flatMap((cat) => cat.items)

  const totalMenuItems = (data?.categories ?? []).reduce((sum, cat) => sum + cat.items.length, 0)

  const toggleCategoryCollapsed = (categoryId: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }))
  }

  const setAllCategoriesCollapsed = (collapsed: boolean) => {
    const next: Record<string, boolean> = {}
    for (const cat of data?.categories ?? []) {
      next[cat.id] = collapsed
    }
    setCollapsedCategories(next)
  }

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItemIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }))
  }

  const handleCompactViewChange = (checked: boolean) => {
    setCompactView(checked)
    if (checked) {
      setAllCategoriesCollapsed(true)
      setExpandedItemIds({})
      setEditingItemId(null)
    } else {
      setAllCategoriesCollapsed(false)
    }
  }

  return (
    <RequirePermission anyOf={['CATALOG_VIEW', 'SETTINGS_VIEW']}>
      <PageShell>
        <PageHeader title={t('menuAdmin.title')} description={t('menuAdmin.description')} />

        {slug && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                {t('menuAdmin.publicStorefront')}
              </CardTitle>
              <CardDescription>{t('menuAdmin.shareLink')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={publicUrl} />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const ok = await copyToClipboard(publicUrl)
                  if (ok) toast.success(t('menuAdmin.linkCopied'))
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t('common.copy')}
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={adminTab} onValueChange={setAdminTab}>
          <TabsList>
            {canViewMenu ? <TabsTrigger value="menu">{t('menuAdmin.tabMenu')}</TabsTrigger> : null}
            {canViewFulfillment ? (
              <TabsTrigger value="fulfillment">{t('menuAdmin.tabFulfillment')}</TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="fulfillment" className="mt-6 space-y-6">
            <fieldset disabled={!canEditFulfillment} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('menuAdmin.fulfillmentSettings')}</CardTitle>
                  <CardDescription>{t('menuAdmin.fulfillmentDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loadingFulfillment ? (
                    <Skeleton className="h-10 w-full" />
                  ) : fulfillmentBranches.length ? (
                    <>
                      <div className="space-y-1">
                        <Label htmlFor="fulfillmentBranch">{t('common.branch')}</Label>
                        <select
                          id="fulfillmentBranch"
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={fulfillmentBranchId}
                          onChange={(e) => setFulfillmentBranchId(e.target.value)}
                        >
                          {fulfillmentBranches.map((branch) => (
                            <option key={branch.branchId} value={branch.branchId}>
                              {branch.branchName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <form onSubmit={handleSaveFulfillment} className="space-y-4">
                        <div className="flex flex-wrap gap-4">
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={fulfillmentForm.deliveryEnabled}
                              onCheckedChange={(checked) =>
                                setFulfillmentForm((f) => ({ ...f, deliveryEnabled: checked }))
                              }
                            />
                            {t('fulfillment.DELIVERY')}
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={fulfillmentForm.takeawayEnabled}
                              onCheckedChange={(checked) =>
                                setFulfillmentForm((f) => ({ ...f, takeawayEnabled: checked }))
                              }
                            />
                            {t('fulfillment.TAKEAWAY')}
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={fulfillmentForm.dineInEnabled}
                              onCheckedChange={(checked) =>
                                setFulfillmentForm((f) => ({ ...f, dineInEnabled: checked }))
                              }
                            />
                            {t('fulfillment.DINE_IN')}
                          </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1">
                            <Label htmlFor="minOrder">{t('menuAdmin.minOrderAmount')}</Label>
                            <Input
                              id="minOrder"
                              type="number"
                              min="0"
                              step="0.01"
                              value={fulfillmentForm.minOrderAmount}
                              onChange={(e) =>
                                setFulfillmentForm((f) => ({
                                  ...f,
                                  minOrderAmount: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="deliveryFee">{t('menuAdmin.defaultDeliveryFee')}</Label>
                            <Input
                              id="deliveryFee"
                              type="number"
                              min="0"
                              step="0.01"
                              value={fulfillmentForm.deliveryFee}
                              onChange={(e) =>
                                setFulfillmentForm((f) => ({ ...f, deliveryFee: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="prepMinutes">{t('menuAdmin.estPrepMinutes')}</Label>
                            <Input
                              id="prepMinutes"
                              type="number"
                              min="1"
                              value={fulfillmentForm.estimatedPrepMinutes}
                              onChange={(e) =>
                                setFulfillmentForm((f) => ({
                                  ...f,
                                  estimatedPrepMinutes: e.target.value,
                                }))
                              }
                            />
                          </div>
                        </div>

                        <div className="rounded-lg border p-4 space-y-3">
                          <div>
                            <p className="font-medium">{t('menuAdmin.orderingHours')}</p>
                            <p className="text-sm text-muted-foreground">
                              {t('menuAdmin.orderingHoursDescription')}
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label htmlFor="liveOrderStart">
                                {t('menuAdmin.liveOrdersFrom')}
                              </Label>
                              <Input
                                id="liveOrderStart"
                                type="time"
                                value={fulfillmentForm.liveOrderStart}
                                onChange={(e) =>
                                  setFulfillmentForm((f) => ({
                                    ...f,
                                    liveOrderStart: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="liveOrderEnd">{t('menuAdmin.liveOrdersUntil')}</Label>
                              <Input
                                id="liveOrderEnd"
                                type="time"
                                value={
                                  fulfillmentForm.liveOrderEnd === '00:00'
                                    ? '00:00'
                                    : fulfillmentForm.liveOrderEnd
                                }
                                onChange={(e) =>
                                  setFulfillmentForm((f) => ({
                                    ...f,
                                    liveOrderEnd: e.target.value || '00:00',
                                  }))
                                }
                              />
                              <p className="text-xs text-muted-foreground">
                                {t('menuAdmin.midnightHint')}
                              </p>
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <Switch
                              checked={fulfillmentForm.allowPreordersOutsideLiveHours}
                              onCheckedChange={(checked) =>
                                setFulfillmentForm((f) => ({
                                  ...f,
                                  allowPreordersOutsideLiveHours: checked,
                                }))
                              }
                            />
                            {t('menuAdmin.allowPreorders')}
                          </label>
                        </div>

                        <Button type="submit" disabled={savingFulfillment}>
                          {t('menuAdmin.saveFulfillment')}
                        </Button>
                      </form>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('common.noBranches')}</p>
                  )}
                </CardContent>
              </Card>

              {fulfillmentBranchId && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t('menuAdmin.deliveryZones')}</CardTitle>
                    <CardDescription>{t('menuAdmin.zonesDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form
                      onSubmit={handleCreateZone}
                      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                    >
                      <div className="space-y-1 sm:col-span-2">
                        <Label htmlFor="zoneName">{t('menuAdmin.zoneName')}</Label>
                        <Input
                          id="zoneName"
                          value={zoneForm.name}
                          onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder={t('menuAdmin.zoneNamePlaceholder')}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="zonePostcode">{t('menuAdmin.postcodePrefix')}</Label>
                        <Input
                          id="zonePostcode"
                          value={zoneForm.postcodePrefix}
                          onChange={(e) =>
                            setZoneForm((f) => ({ ...f, postcodePrefix: e.target.value }))
                          }
                          placeholder={t('menuAdmin.postcodePrefixPlaceholder')}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="zoneFee">{t('menuAdmin.zoneDeliveryFee')}</Label>
                        <Input
                          id="zoneFee"
                          type="number"
                          min="0"
                          step="0.01"
                          value={zoneForm.deliveryFee}
                          onChange={(e) =>
                            setZoneForm((f) => ({ ...f, deliveryFee: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="zoneMin">{t('menuAdmin.zoneMinOrder')}</Label>
                        <Input
                          id="zoneMin"
                          type="number"
                          min="0"
                          step="0.01"
                          value={zoneForm.minOrderAmount}
                          onChange={(e) =>
                            setZoneForm((f) => ({ ...f, minOrderAmount: e.target.value }))
                          }
                        />
                      </div>
                      <div className="flex items-end sm:col-span-2 lg:col-span-5">
                        <Button type="submit" disabled={creatingZone}>
                          {t('menuAdmin.addZone')}
                        </Button>
                      </div>
                    </form>

                    <ul className="divide-y rounded-lg border">
                      {(selectedFulfillmentBranch?.deliveryZones ?? []).map((zone) => (
                        <li
                          key={zone.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">{zone.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {zone.postcode_prefix ? `${zone.postcode_prefix} · ` : ''}
                              {t('common.fee', {
                                amount: formatPrice(Number(zone.delivery_fee)),
                              })}{' '}
                              ·{' '}
                              {t('common.minOrder', {
                                amount: formatPrice(Number(zone.min_order_amount)),
                              })}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDeleteZone(zone.id, zone.name)}
                            aria-label={t('menuAdmin.deleteZoneAria', { name: zone.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                      {!selectedFulfillmentBranch?.deliveryZones?.length && (
                        <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                          {t('menuAdmin.noZones')}
                        </li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </fieldset>
          </TabsContent>

          <TabsContent value="menu" className="mt-6 space-y-6">
            <fieldset disabled={!canEditMenu} className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('menuAdmin.addCategory')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateCategory} className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="catName">{t('common.name')}</Label>
                        <Input
                          id="catName"
                          value={categoryForm.name}
                          onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="catDesc">{t('common.description')}</Label>
                        <Input
                          id="catDesc"
                          value={categoryForm.description}
                          onChange={(e) =>
                            setCategoryForm((f) => ({ ...f, description: e.target.value }))
                          }
                        />
                      </div>
                      <Button type="submit" disabled={creatingCategory}>
                        {t('menuAdmin.createCategory')}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('menuAdmin.addItem')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateItem} className="space-y-3">
                      <div className="space-y-1">
                        <Label htmlFor="itemCategory">{t('common.category')}</Label>
                        <select
                          id="itemCategory"
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={itemForm.categoryId}
                          onChange={(e) =>
                            setItemForm((f) => ({ ...f, categoryId: e.target.value }))
                          }
                          required
                        >
                          <option value="">{t('menuAdmin.selectCategory')}</option>
                          {(data?.categories ?? []).map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="itemName">{t('common.name')}</Label>
                        <Input
                          id="itemName"
                          value={itemForm.name}
                          onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="itemPrice">{t('common.price')}</Label>
                        <Input
                          id="itemPrice"
                          type="number"
                          min="0"
                          step="0.01"
                          value={itemForm.basePrice}
                          onChange={(e) =>
                            setItemForm((f) => ({ ...f, basePrice: e.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{t('common.photo')}</Label>
                        <LogoUpload
                          currentLogo={itemForm.imageUrl}
                          onUpload={handleCreateItemImageUpload}
                          entityId={restaurantId}
                          entityName={itemForm.name || t('menuAdmin.menuItem')}
                          getPresignedUrl={handleGetPresignedUrl}
                          uploadLabel={t('menuAdmin.uploadPhoto')}
                          changeLabel={t('menuAdmin.changePhoto')}
                          removeLabel={t('menuAdmin.removePhoto')}
                          previewAlt={
                            itemForm.name
                              ? t('menuAdmin.menuItemPhotoNamed', { name: itemForm.name })
                              : t('menuAdmin.menuItemPhoto')
                          }
                          previewClassName="w-40 h-28"
                          helperText={t('menuAdmin.photoHelper')}
                        />
                      </div>
                      <Button
                        type="submit"
                        disabled={creatingItem || !(data?.categories ?? []).length}
                      >
                        {t('menuAdmin.createItem')}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>{t('menuAdmin.addModifierGroup')}</CardTitle>
                  <CardDescription>{t('menuAdmin.modifierDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={handleCreateModifierGroup}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                  >
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="modItem">{t('menuAdmin.menuItem')}</Label>
                      <select
                        id="modItem"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={modifierGroupForm.menuItemId}
                        onChange={(e) =>
                          setModifierGroupForm((f) => ({ ...f, menuItemId: e.target.value }))
                        }
                        required
                      >
                        <option value="">{t('menuAdmin.selectItem')}</option>
                        {allItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="modGroupName">{t('menuAdmin.groupName')}</Label>
                      <Input
                        id="modGroupName"
                        value={modifierGroupForm.name}
                        onChange={(e) =>
                          setModifierGroupForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder={t('menuAdmin.groupNamePlaceholder')}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="modMin">{t('common.min')}</Label>
                      <Input
                        id="modMin"
                        type="number"
                        min="0"
                        value={modifierGroupForm.minSelections}
                        onChange={(e) =>
                          setModifierGroupForm((f) => ({ ...f, minSelections: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="modMax">{t('common.max')}</Label>
                      <Input
                        id="modMax"
                        type="number"
                        min="1"
                        value={modifierGroupForm.maxSelections}
                        onChange={(e) =>
                          setModifierGroupForm((f) => ({ ...f, maxSelections: e.target.value }))
                        }
                      />
                    </div>
                    <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
                      <label className="flex items-center gap-2 text-sm">
                        <Switch
                          checked={modifierGroupForm.isRequired}
                          onCheckedChange={(checked) =>
                            setModifierGroupForm((f) => ({ ...f, isRequired: checked }))
                          }
                        />
                        {t('common.required')}
                      </label>
                      <Button type="submit" disabled={creatingGroup || !allItems.length}>
                        {t('menuAdmin.addGroup')}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <MenuBulkImportPanel onImported={() => refetch()} />

              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle>{t('menuAdmin.currentMenu')}</CardTitle>
                    <CardDescription>
                      {t('menuAdmin.categoryCount', {
                        count: (data?.categories ?? []).length,
                      })}{' '}
                      ·{' '}
                      {t('menuAdmin.itemCount', {
                        count: totalMenuItems,
                      })}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                      {compactView ? (
                        <LayoutList className="h-4 w-4 text-muted-foreground" aria-hidden />
                      ) : (
                        <List className="h-4 w-4 text-muted-foreground" aria-hidden />
                      )}
                      <span className="whitespace-nowrap">{t('menuAdmin.compactView')}</span>
                      <Switch checked={compactView} onCheckedChange={handleCompactViewChange} />
                    </label>
                    {compactView ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAllCategoriesCollapsed(false)}
                        >
                          {t('menuAdmin.expandAll')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAllCategoriesCollapsed(true)}
                        >
                          {t('menuAdmin.collapseAll')}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading && <Skeleton className="h-24 w-full" />}
                  {!isLoading &&
                    (data?.categories ?? []).map((category) => {
                      const isCategoryCollapsed = collapsedCategories[category.id] ?? compactView

                      return (
                        <div key={category.id} className="overflow-hidden rounded-lg border">
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                            onClick={() => toggleCategoryCollapsed(category.id)}
                            aria-expanded={!isCategoryCollapsed}
                          >
                            {isCategoryCollapsed ? (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span className="font-medium">{category.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {t('menuAdmin.itemsInCategory', { count: category.items.length })}
                            </span>
                          </button>

                          {!isCategoryCollapsed ? (
                            <ul className={cn('divide-y', compactView ? '' : 'space-y-0')}>
                              {category.items.map((item) => {
                                const isItemExpanded = expandedItemIds[item.id] ?? !compactView
                                const showItemDetails =
                                  !compactView || isItemExpanded || editingItemId === item.id

                                return (
                                  <li
                                    key={item.id}
                                    className={cn(compactView && !showItemDetails && 'px-3 py-2')}
                                  >
                                    {compactView && !showItemDetails ? (
                                      <div className="flex items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                          onClick={() => toggleItemExpanded(item.id)}
                                        >
                                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                          <span className="truncate font-medium">{item.name}</span>
                                          <span className="shrink-0 text-sm text-muted-foreground">
                                            {formatPrice(Number(item.base_price))}
                                          </span>
                                          {!item.is_available ? (
                                            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                              {t('common.off')}
                                            </span>
                                          ) : null}
                                        </button>
                                        <div className="flex shrink-0 gap-0.5">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => startEditItem(item)}
                                            aria-label={t('menuAdmin.editItemAria', {
                                              name: item.name,
                                            })}
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive"
                                            onClick={() => handleDeleteItem(item.id, item.name)}
                                            aria-label={t('menuAdmin.deleteItemAria', {
                                              name: item.name,
                                            })}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className={cn(compactView ? 'p-3' : 'p-3')}>
                                        {compactView ? (
                                          <button
                                            type="button"
                                            className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                            onClick={() => toggleItemExpanded(item.id)}
                                          >
                                            <ChevronDown className="h-3.5 w-3.5" />
                                            {t('menuAdmin.collapse')}
                                          </button>
                                        ) : null}
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex gap-3">
                                            {!compactView ? (
                                              item.image_url ? (
                                                <img
                                                  src={item.image_url}
                                                  alt=""
                                                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                                                />
                                              ) : (
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                                                  {t('menuAdmin.noPhoto')}
                                                </div>
                                              )
                                            ) : null}
                                            <div>
                                              <p className="font-medium">{item.name}</p>
                                              <p className="text-sm text-muted-foreground">
                                                {formatPrice(Number(item.base_price))}
                                                {!item.is_available &&
                                                  t('menuAdmin.unavailableSuffix')}
                                              </p>
                                            </div>
                                          </div>
                                          <div className="flex gap-1">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => startEditItem(item)}
                                              aria-label={t('menuAdmin.editItemAria', {
                                                name: item.name,
                                              })}
                                            >
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="text-destructive"
                                              onClick={() => handleDeleteItem(item.id, item.name)}
                                              aria-label={t('menuAdmin.deleteItemAria', {
                                                name: item.name,
                                              })}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>

                                        {editingItemId === item.id && (
                                          <form
                                            onSubmit={handleUpdateItem}
                                            className="mt-3 space-y-2 border-t pt-3"
                                          >
                                            <Input
                                              value={editForm.name}
                                              onChange={(e) =>
                                                setEditForm((f) => ({ ...f, name: e.target.value }))
                                              }
                                              required
                                            />
                                            <Input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              value={editForm.basePrice}
                                              onChange={(e) =>
                                                setEditForm((f) => ({
                                                  ...f,
                                                  basePrice: e.target.value,
                                                }))
                                              }
                                              required
                                            />
                                            <Input
                                              value={editForm.description}
                                              onChange={(e) =>
                                                setEditForm((f) => ({
                                                  ...f,
                                                  description: e.target.value,
                                                }))
                                              }
                                              placeholder={t('common.description')}
                                            />
                                            <div className="space-y-1">
                                              <Label>{t('common.photo')}</Label>
                                              <LogoUpload
                                                currentLogo={editForm.imageUrl}
                                                onUpload={handleEditItemImageUpload}
                                                entityId={restaurantId}
                                                entityName={editForm.name || item.name}
                                                getPresignedUrl={handleGetPresignedUrl}
                                                uploadLabel={t('menuAdmin.uploadPhoto')}
                                                changeLabel={t('menuAdmin.changePhoto')}
                                                removeLabel={t('menuAdmin.removePhoto')}
                                                previewAlt={t('menuAdmin.menuItemPhotoNamed', {
                                                  name: editForm.name || item.name,
                                                })}
                                                previewClassName="w-40 h-28"
                                                helperText={t('menuAdmin.photoHelper')}
                                              />
                                            </div>
                                            <label className="flex items-center gap-2 text-sm">
                                              <Switch
                                                checked={editForm.isAvailable}
                                                onCheckedChange={(checked) =>
                                                  setEditForm((f) => ({
                                                    ...f,
                                                    isAvailable: checked,
                                                  }))
                                                }
                                              />
                                              {t('menuAdmin.available')}
                                            </label>
                                            <div className="flex gap-2">
                                              <Button
                                                type="submit"
                                                size="sm"
                                                disabled={updatingItem}
                                              >
                                                {t('common.save')}
                                              </Button>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setEditingItemId(null)}
                                              >
                                                {t('common.cancel')}
                                              </Button>
                                            </div>
                                          </form>
                                        )}

                                        {(item.modifierGroups?.length ?? 0) > 0 && (
                                          <div className="mt-3 space-y-2 border-t pt-3">
                                            <p className="text-xs font-medium uppercase text-muted-foreground">
                                              {t('common.modifiers')}
                                            </p>
                                            {item.modifierGroups!.map((group) => (
                                              <div
                                                key={group.id}
                                                className="rounded-md bg-muted/40 p-2 text-sm"
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="font-medium">
                                                    {group.name}
                                                    {group.is_required && ' *'}
                                                    <span className="ml-1 text-xs text-muted-foreground">
                                                      ({group.min_selections}–{group.max_selections}
                                                      )
                                                    </span>
                                                  </span>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-destructive"
                                                    onClick={() =>
                                                      handleDeleteModifierGroup(
                                                        group.id,
                                                        group.name
                                                      )
                                                    }
                                                  >
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                                <ul className="mt-1 space-y-1 pl-2">
                                                  {group.options.map((option) => (
                                                    <li
                                                      key={option.id}
                                                      className="flex items-center justify-between text-xs"
                                                    >
                                                      <span>
                                                        {option.name}
                                                        {Number(option.price_delta) > 0 &&
                                                          ` (+${formatPrice(Number(option.price_delta))})`}
                                                      </span>
                                                      <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-destructive"
                                                        onClick={() =>
                                                          handleDeleteModifierOption(
                                                            option.id,
                                                            option.name
                                                          )
                                                        }
                                                      >
                                                        <Trash2 className="h-3 w-3" />
                                                      </Button>
                                                    </li>
                                                  ))}
                                                </ul>
                                                <div className="mt-2 flex gap-2">
                                                  <Input
                                                    placeholder={t('menuAdmin.optionName')}
                                                    className="h-8 text-xs"
                                                    value={optionForms[group.id]?.name ?? ''}
                                                    onChange={(e) =>
                                                      setOptionForms((prev) => ({
                                                        ...prev,
                                                        [group.id]: {
                                                          name: e.target.value,
                                                          priceDelta:
                                                            prev[group.id]?.priceDelta ?? '0',
                                                        },
                                                      }))
                                                    }
                                                  />
                                                  <Input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder={t('menuAdmin.pricePlus')}
                                                    className="h-8 w-24 text-xs"
                                                    value={optionForms[group.id]?.priceDelta ?? '0'}
                                                    onChange={(e) =>
                                                      setOptionForms((prev) => ({
                                                        ...prev,
                                                        [group.id]: {
                                                          name: prev[group.id]?.name ?? '',
                                                          priceDelta: e.target.value,
                                                        },
                                                      }))
                                                    }
                                                  />
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8"
                                                    disabled={creatingOption}
                                                    onClick={() =>
                                                      handleCreateModifierOption(group.id)
                                                    }
                                                  >
                                                    {t('common.add')}
                                                  </Button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </li>
                                )
                              })}
                              {!category.items.length && (
                                <li className="px-3 py-4 text-sm text-muted-foreground">
                                  {t('menuAdmin.noItemsYet')}
                                </li>
                              )}
                            </ul>
                          ) : null}
                        </div>
                      )
                    })}
                  {!isLoading && !(data?.categories ?? []).length && (
                    <EmptyState
                      title={t('menuAdmin.emptyTitle')}
                      description={t('menuAdmin.emptyDescription')}
                    />
                  )}
                </CardContent>
              </Card>
            </fieldset>
          </TabsContent>
        </Tabs>
      </PageShell>
    </RequirePermission>
  )
}

export default MenuAdminPage
