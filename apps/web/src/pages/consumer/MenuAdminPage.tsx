import { FormEvent, useEffect, useMemo, useState } from 'react'
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

export function MenuAdminPage() {
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

  const fulfillmentBranches = fulfillmentData?.branches ?? []
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
      toast.success('Fulfillment settings saved')
      refetchFulfillment()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to save fulfillment settings')
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
      toast.success('Delivery zone created')
      refetchFulfillment()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to create zone')
    }
  }

  const handleDeleteZone = async (zoneId: string, zoneName: string) => {
    if (!window.confirm(`Delete zone "${zoneName}"?`)) return
    try {
      await deleteZone(zoneId).unwrap()
      toast.success('Zone deleted')
      refetchFulfillment()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to delete zone')
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
      toast.success('Category created')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to create category')
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
      toast.success('Item created')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to create item')
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
      toast.success('Item updated')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to update item')
    }
  }

  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Delete "${itemName}"?`)) return
    try {
      await deleteItem(itemId).unwrap()
      if (editingItemId === itemId) setEditingItemId(null)
      toast.success('Item deleted')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to delete item')
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
      toast.success('Modifier group created')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to create modifier group')
    }
  }

  const handleDeleteModifierGroup = async (groupId: string, groupName: string) => {
    if (!window.confirm(`Delete modifier group "${groupName}"?`)) return
    try {
      await deleteModifierGroup(groupId).unwrap()
      toast.success('Modifier group deleted')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to delete modifier group')
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
      toast.success('Option added')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to add option')
    }
  }

  const handleDeleteModifierOption = async (optionId: string, optionName: string) => {
    if (!window.confirm(`Delete option "${optionName}"?`)) return
    try {
      await deleteModifierOption(optionId).unwrap()
      toast.success('Option deleted')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to delete option')
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
    <RequirePermission permission="CATALOG_VIEW">
      <PageShell>
        <PageHeader
          title="Consumer menu"
          description="Manage your guest-facing menu for online ordering."
        />

        {slug && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                Public storefront
              </CardTitle>
              <CardDescription>Share this link with guests.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={publicUrl} />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const ok = await copyToClipboard(publicUrl)
                  if (ok) toast.success('Link copied')
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs value={adminTab} onValueChange={setAdminTab}>
          <TabsList>
            <TabsTrigger value="menu">Menu</TabsTrigger>
            <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
          </TabsList>

          <TabsContent value="fulfillment" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Fulfillment settings</CardTitle>
                <CardDescription>
                  Configure delivery, takeaway, dine-in, and prep times per branch.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingFulfillment ? (
                  <Skeleton className="h-10 w-full" />
                ) : fulfillmentBranches.length ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="fulfillmentBranch">Branch</Label>
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
                          Delivery
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={fulfillmentForm.takeawayEnabled}
                            onCheckedChange={(checked) =>
                              setFulfillmentForm((f) => ({ ...f, takeawayEnabled: checked }))
                            }
                          />
                          Takeaway
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={fulfillmentForm.dineInEnabled}
                            onCheckedChange={(checked) =>
                              setFulfillmentForm((f) => ({ ...f, dineInEnabled: checked }))
                            }
                          />
                          Dine-in
                        </label>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="minOrder">Min order amount</Label>
                          <Input
                            id="minOrder"
                            type="number"
                            min="0"
                            step="0.01"
                            value={fulfillmentForm.minOrderAmount}
                            onChange={(e) =>
                              setFulfillmentForm((f) => ({ ...f, minOrderAmount: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="deliveryFee">Default delivery fee</Label>
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
                          <Label htmlFor="prepMinutes">Est. prep (minutes)</Label>
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
                          <p className="font-medium">Online ordering hours</p>
                          <p className="text-sm text-muted-foreground">
                            Live (ASAP) orders between these times. Outside this window, diners can
                            only place preorders scheduled for the next opening time (e.g. 12:00–
                            midnight live, midnight–12:00 preorders).
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="liveOrderStart">Live orders from</Label>
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
                            <Label htmlFor="liveOrderEnd">Live orders until</Label>
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
                              Use 00:00 for midnight (end of day).
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
                          Allow preorders outside live hours
                        </label>
                      </div>

                      <Button type="submit" disabled={savingFulfillment}>
                        Save fulfillment settings
                      </Button>
                    </form>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No branches configured.</p>
                )}
              </CardContent>
            </Card>

            {fulfillmentBranchId && (
              <Card>
                <CardHeader>
                  <CardTitle>Delivery zones</CardTitle>
                  <CardDescription>
                    Optional zones with custom fees and minimums for this branch.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form
                    onSubmit={handleCreateZone}
                    className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                  >
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="zoneName">Zone name</Label>
                      <Input
                        id="zoneName"
                        value={zoneForm.name}
                        onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Central London"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="zonePostcode">Postcode prefix</Label>
                      <Input
                        id="zonePostcode"
                        value={zoneForm.postcodePrefix}
                        onChange={(e) =>
                          setZoneForm((f) => ({ ...f, postcodePrefix: e.target.value }))
                        }
                        placeholder="SW1"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="zoneFee">Delivery fee</Label>
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
                      <Label htmlFor="zoneMin">Min order</Label>
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
                        Add zone
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
                            Fee {formatPrice(Number(zone.delivery_fee))} · Min{' '}
                            {formatPrice(Number(zone.min_order_amount))}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDeleteZone(zone.id, zone.name)}
                          aria-label={`Delete ${zone.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                    {!selectedFulfillmentBranch?.deliveryZones?.length && (
                      <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                        No delivery zones yet.
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="menu" className="mt-6 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Add category</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateCategory} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="catName">Name</Label>
                      <Input
                        id="catName"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="catDesc">Description</Label>
                      <Input
                        id="catDesc"
                        value={categoryForm.description}
                        onChange={(e) =>
                          setCategoryForm((f) => ({ ...f, description: e.target.value }))
                        }
                      />
                    </div>
                    <Button type="submit" disabled={creatingCategory}>
                      Create category
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add item</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateItem} className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="itemCategory">Category</Label>
                      <select
                        id="itemCategory"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={itemForm.categoryId}
                        onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value }))}
                        required
                      >
                        <option value="">Select category</option>
                        {(data?.categories ?? []).map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="itemName">Name</Label>
                      <Input
                        id="itemName"
                        value={itemForm.name}
                        onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="itemPrice">Price</Label>
                      <Input
                        id="itemPrice"
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemForm.basePrice}
                        onChange={(e) => setItemForm((f) => ({ ...f, basePrice: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Photo</Label>
                      <LogoUpload
                        currentLogo={itemForm.imageUrl}
                        onUpload={handleCreateItemImageUpload}
                        entityId={restaurantId}
                        entityName={itemForm.name || 'Menu item'}
                        getPresignedUrl={handleGetPresignedUrl}
                        uploadLabel="Upload photo"
                        changeLabel="Change photo"
                        removeLabel="Remove photo"
                        previewAlt={itemForm.name ? `${itemForm.name} photo` : 'Menu item photo'}
                        previewClassName="w-40 h-28"
                        helperText="Recommended: landscape photo, at least 800px wide. Max size: 5MB."
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={creatingItem || !(data?.categories ?? []).length}
                    >
                      Create item
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Add modifier group</CardTitle>
                <CardDescription>
                  Modifier groups let guests customize items (size, toppings, etc.).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleCreateModifierGroup}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                >
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="modItem">Menu item</Label>
                    <select
                      id="modItem"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={modifierGroupForm.menuItemId}
                      onChange={(e) =>
                        setModifierGroupForm((f) => ({ ...f, menuItemId: e.target.value }))
                      }
                      required
                    >
                      <option value="">Select item</option>
                      {allItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modGroupName">Group name</Label>
                    <Input
                      id="modGroupName"
                      value={modifierGroupForm.name}
                      onChange={(e) =>
                        setModifierGroupForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder="Size"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="modMin">Min</Label>
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
                    <Label htmlFor="modMax">Max</Label>
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
                      Required
                    </label>
                    <Button type="submit" disabled={creatingGroup || !allItems.length}>
                      Add group
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <MenuBulkImportPanel onImported={() => refetch()} />

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Current menu</CardTitle>
                  <CardDescription>
                    {(data?.categories ?? []).length} categor
                    {(data?.categories ?? []).length === 1 ? 'y' : 'ies'} · {totalMenuItems} item
                    {totalMenuItems === 1 ? '' : 's'}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                    {compactView ? (
                      <LayoutList className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <List className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                    <span className="whitespace-nowrap">Compact view</span>
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
                        Expand all
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAllCategoriesCollapsed(true)}
                      >
                        Collapse all
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
                            {category.items.length} item{category.items.length === 1 ? '' : 's'}
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
                                            Off
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
                                          aria-label={`Edit ${item.name}`}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive"
                                          onClick={() => handleDeleteItem(item.id, item.name)}
                                          aria-label={`Delete ${item.name}`}
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
                                          Collapse
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
                                                No photo
                                              </div>
                                            )
                                          ) : null}
                                          <div>
                                            <p className="font-medium">{item.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                              {formatPrice(Number(item.base_price))}
                                              {!item.is_available && ' · Unavailable'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex gap-1">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => startEditItem(item)}
                                            aria-label={`Edit ${item.name}`}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive"
                                            onClick={() => handleDeleteItem(item.id, item.name)}
                                            aria-label={`Delete ${item.name}`}
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
                                            placeholder="Description"
                                          />
                                          <div className="space-y-1">
                                            <Label>Photo</Label>
                                            <LogoUpload
                                              currentLogo={editForm.imageUrl}
                                              onUpload={handleEditItemImageUpload}
                                              entityId={restaurantId}
                                              entityName={editForm.name || item.name}
                                              getPresignedUrl={handleGetPresignedUrl}
                                              uploadLabel="Upload photo"
                                              changeLabel="Change photo"
                                              removeLabel="Remove photo"
                                              previewAlt={`${editForm.name || item.name} photo`}
                                              previewClassName="w-40 h-28"
                                              helperText="Recommended: landscape photo, at least 800px wide. Max size: 5MB."
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
                                            Available
                                          </label>
                                          <div className="flex gap-2">
                                            <Button type="submit" size="sm" disabled={updatingItem}>
                                              Save
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={() => setEditingItemId(null)}
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        </form>
                                      )}

                                      {(item.modifierGroups?.length ?? 0) > 0 && (
                                        <div className="mt-3 space-y-2 border-t pt-3">
                                          <p className="text-xs font-medium uppercase text-muted-foreground">
                                            Modifiers
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
                                                    ({group.min_selections}–{group.max_selections})
                                                  </span>
                                                </span>
                                                <Button
                                                  type="button"
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 text-destructive"
                                                  onClick={() =>
                                                    handleDeleteModifierGroup(group.id, group.name)
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
                                                  placeholder="Option name"
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
                                                  placeholder="Price +"
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
                                                  Add
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
                                No items yet
                              </li>
                            )}
                          </ul>
                        ) : null}
                      </div>
                    )
                  })}
                {!isLoading && !(data?.categories ?? []).length && (
                  <EmptyState
                    title="No menu yet"
                    description="Create a category above, import from CSV, or add items one at a time."
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageShell>
    </RequirePermission>
  )
}

export default MenuAdminPage
