import { Suspense, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  useGetQuickListsQuery,
  useCreateQuickListMutation,
  useDeleteQuickListMutation,
  useGetProductsQuery,
  useAddItemToQuickListMutation,
  useScheduleQuickListMutation,
  useUnscheduleQuickListMutation,
  useGetQuickListQuery,
  useSuggestQuickListItemsMutation,
  useApplyQuickListSuggestionsMutation,
} from '../services/api'
import { RequirePermission } from '../components/RequirePermission'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import {
  CardActionGrid,
  CardStatusBadges,
  cardActionBtnClass,
  cardShellClass,
} from '../components/ui/card-layout'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import {
  List,
  Plus,
  ShoppingCart,
  Trash2,
  Edit,
  Package,
  Search,
  X,
  Clock,
  Calendar,
  Pause,
  Eye,
  Filter,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useCartActions } from '../hooks/useCartActions'
import { useGetEntitlementsQuery } from '../services/api'
import {
  getPlanLimitGate,
  isQuickListSchedulingEnabled,
  getQuickListScheduleGate,
  hasQuickListCapability,
} from '../lib/planLimits'
import { LimitExceededBanner } from '../components/LimitExceededBanner'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { SummaryStrip } from '../components/ui/app-panel'
import { Skeleton } from '../components/ui/skeleton'
import { parseDaysOfWeek } from '../utils/parseDaysOfWeek'
import {
  LazyQuickListCreateDialog,
  LazyQuickListProductDialog,
  LazyQuickListScheduleDialog,
  LazyQuickListDetailsDialog,
} from '../components/quick-lists/lazyQuickListDialogs'

export function QuickListsPage() {
  const { t, i18n } = useTranslation('cart')
  const dateLocale = i18n.language?.startsWith('ar') ? 'ar' : 'en-US'
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [showScheduledOrder, setShowScheduledOrder] = useState(false)
  const [showListDetails, setShowListDetails] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [selectedListForSchedule, setSelectedListForSchedule] = useState<any>(null)
  const [selectedListForDetails, setSelectedListForDetails] = useState<any>(null)
  const [productSearch, setProductSearch] = useState('')
  const [listSearch, setListSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'scheduled' | 'unscheduled'>('all')
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [scheduleFrequency, setScheduleFrequency] = useState<
    'DAILY' | 'WEEKLY' | 'WEEKLY_3X' | 'BIWEEKLY' | 'MONTHLY'
  >('WEEKLY')
  const [scheduleDays, setScheduleDays] = useState<string[]>(['MONDAY', 'WEDNESDAY', 'FRIDAY'])
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [autoCreateOrder, setAutoCreateOrder] = useState(true)
  const [useAiQuantities, setUseAiQuantities] = useState(false)

  const { addItem } = useCartActions()
  const navigate = useNavigate()

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const quickListSchedulingEnabled = isQuickListSchedulingEnabled(entitlementsData?.entitlements)
  const smartQuantitiesAllowed = hasQuickListCapability(
    entitlementsData?.entitlements,
    'aiQuantityAdjust'
  )
  const aiSuggestAllowed = hasQuickListCapability(entitlementsData?.entitlements, 'aiSuggest')
  const scheduledQuickListGate = getPlanLimitGate(
    entitlementsData?.entitlements,
    'scheduled_quick_lists'
  )
  const quickListCreateGate = getPlanLimitGate(entitlementsData?.entitlements, 'quick_lists')
  const quickListItemGate = getPlanLimitGate(entitlementsData?.entitlements, 'quick_list_items')

  const { data, isLoading, refetch } = useGetQuickListsQuery()
  const { data: productsData } = useGetProductsQuery({ limit: 1000 })
  const { data: selectedListDetailsData } = useGetQuickListQuery(selectedListForDetails?.id || '', {
    skip: !selectedListForDetails,
  })
  const selectedListDetails = selectedListDetailsData?.quickList
  const [createQuickList] = useCreateQuickListMutation()
  const [deleteQuickList] = useDeleteQuickListMutation()
  const [addItemToQuickList] = useAddItemToQuickListMutation()
  const [scheduleQuickList] = useScheduleQuickListMutation()
  const [suggestQuickListItems, { isLoading: isSuggesting }] = useSuggestQuickListItemsMutation()
  const [applyQuickListSuggestions] = useApplyQuickListSuggestionsMutation()
  const [unscheduleQuickList] = useUnscheduleQuickListMutation()

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error(t('quickLists.toastListNameRequired'))
      return
    }
    if (!quickListCreateGate.canUse) {
      toast.error(quickListCreateGate.message)
      return
    }

    try {
      await createQuickList({
        name: newListName,
        description: newListDescription,
        items: [],
      }).unwrap()
      toast.success(t('quickLists.toastListCreated'))
      setShowCreateDialog(false)
      setNewListName('')
      setNewListDescription('')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('quickLists.toastCreateFailed'))
    }
  }

  const handleAddProducts = (listId: string) => {
    setSelectedListId(listId)
    setShowProductDialog(true)
  }

  const handleAddProductToList = async (product: any) => {
    if (!selectedListId) return
    if (!quickListItemGate.canUse) {
      toast.error(quickListItemGate.message)
      return
    }

    try {
      await addItemToQuickList({
        quickListId: selectedListId,
        body: {
          productId: product.id,
          supplierId: product.supplier_id,
          quantity: 1,
          notes: '',
        },
      }).unwrap()
      toast.success(t('quickLists.toastProductAdded', { name: product.name }))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('quickLists.toastAddProductFailed'))
    }
  }

  const catalogProducts = useMemo(() => {
    const seen = new Set<string>()
    return (productsData?.products ?? []).filter((product: any) => {
      const id = String(product?.id ?? '')
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [productsData?.products])

  const filteredProducts = useMemo(
    () =>
      catalogProducts.filter(
        (product: any) =>
          product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
          product.sku?.toLowerCase().includes(productSearch.toLowerCase())
      ),
    [catalogProducts, productSearch]
  )

  const handleDeleteList = async (listId: string, listName: string) => {
    if (!confirm(t('quickLists.confirmDelete', { name: listName }))) return

    try {
      await deleteQuickList(listId).unwrap()
      toast.success(t('quickLists.toastListDeleted'))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('quickLists.toastDeleteFailed'))
    }
  }

  const handleOrderFromList = async (listId: string) => {
    const list = quickLists.find((l: any) => l.id === listId)
    if (!list) {
      toast.error(t('quickLists.toastListNotFound'))
      return
    }

    // If list doesn't have items array, fetch it from API
    if (!list.items || list.items.length === 0) {
      toast.error(t('quickLists.toastListEmpty'))
      return
    }

    try {
      // Add all items from the quick list to cart
      for (const item of list.items) {
        // Fetch product details
        const product = catalogProducts.find((p: any) => p.id === item.product_id)
        if (product) {
          addItem({
            productId: product.id,
            product,
            quantity: parseFloat(item.quantity) || 1,
          })
        }
      }

      toast.success(
        t('quickLists.toastAddedToCart', {
          count: list.items?.length || 0,
          name: list.name,
        })
      )

      // Optionally navigate to cart
      setTimeout(() => {
        navigate('/app/cart')
      }, 500)
    } catch (error) {
      toast.error(t('quickLists.toastAddToCartFailed'))
    }
  }

  const handleScheduleOrder = (list: any) => {
    const scheduleGate = getQuickListScheduleGate(entitlementsData?.entitlements, list.is_scheduled)
    if (!scheduleGate.canSchedule) {
      toast.error(scheduleGate.message)
      return
    }
    setSelectedListForSchedule(list)

    // Pre-populate with existing schedule if available, otherwise use defaults
    if (list.is_scheduled && list.frequency) {
      setScheduleFrequency(list.frequency)
      if (list.days_of_week) {
        const days = parseDaysOfWeek(list.days_of_week)
        setScheduleDays(
          days.length > 0
            ? days
            : list.frequency === 'WEEKLY'
              ? ['MONDAY']
              : ['MONDAY', 'WEDNESDAY', 'FRIDAY']
        )
      } else {
        setScheduleDays(
          list.frequency === 'WEEKLY' ? ['MONDAY'] : ['MONDAY', 'WEDNESDAY', 'FRIDAY']
        )
      }
      setScheduleTime(list.preferred_time ? list.preferred_time.slice(0, 5) : '09:00')
      setAutoCreateOrder(list.auto_create_order !== false)
      setUseAiQuantities(Boolean(list.use_ai_quantities))
    } else {
      // Reset to defaults when creating new schedule
      setScheduleFrequency('WEEKLY')
      setScheduleDays(['MONDAY'])
      setScheduleTime('09:00')
      setAutoCreateOrder(true)
      setUseAiQuantities(false)
    }

    setShowScheduledOrder(true)
  }

  const handleCreateScheduledOrder = async () => {
    if (!selectedListForSchedule) return

    try {
      await scheduleQuickList({
        quickListId: selectedListForSchedule.id,
        body: {
          frequency: scheduleFrequency,
          daysOfWeek:
            scheduleFrequency === 'WEEKLY' ||
            scheduleFrequency === 'WEEKLY_3X' ||
            scheduleFrequency === 'BIWEEKLY'
              ? scheduleDays
              : undefined,
          preferredTime: scheduleTime,
          autoCreateOrder,
          useAiQuantities: smartQuantitiesAllowed ? useAiQuantities : false,
        },
      }).unwrap()

      toast.success(t('quickLists.toastScheduled', { name: selectedListForSchedule.name }), {
        duration: 3000,
      })

      setShowScheduledOrder(false)
      setSelectedListForSchedule(null)
      setScheduleFrequency('WEEKLY')
      setScheduleDays(['MONDAY']) // Reset to single day for weekly
      refetch()
    } catch (error: any) {
      const apiError = error?.data?.error
      const message =
        apiError?.message ||
        (apiError?.name === 'LIMIT_EXCEEDED'
          ? t('quickLists.toastPlanLimitReached', {
              key: apiError?.details?.limitKey ?? 'limit',
            })
          : apiError?.name === 'FEATURE_NOT_AVAILABLE'
            ? t('quickLists.toastScheduleRequiresPaidPlan')
            : t('quickLists.toastScheduleFailed'))
      toast.error(message)
    }
  }

  const handleSuggestItems = async (list: { id: string; name: string }) => {
    try {
      const result = await suggestQuickListItems(list.id).unwrap()
      const proposals = result?.proposals ?? []
      if (proposals.length === 0) {
        toast.message('No new suggestions right now', {
          description: 'Your list already matches current reorder recommendations.',
        })
        return
      }
      const applied = await applyQuickListSuggestions({
        quickListId: list.id,
        proposals: proposals.map((p: any) => ({
          action: p.action,
          productId: p.productId,
          supplierId: p.supplierId,
          quantity: p.quantity,
        })),
      }).unwrap()
      toast.success(`Updated ${applied.applied} item(s) on "${list.name}"`)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Could not apply suggestions')
    }
  }

  const toggleScheduleDay = (day: string) => {
    if (scheduleDays.includes(day)) {
      setScheduleDays(scheduleDays.filter((d) => d !== day))
    } else {
      // For WEEKLY (once per week), only allow one day
      if (scheduleFrequency === 'WEEKLY') {
        setScheduleDays([day])
      }
      // For WEEKLY_3X (three times per week), only allow maximum 3 days
      else if (scheduleFrequency === 'WEEKLY_3X') {
        if (scheduleDays.length < 3) {
          setScheduleDays([...scheduleDays, day])
        } else {
          toast.error(t('quickLists.toastMaxThreeDays'))
        }
      }
      // For other frequencies, allow multiple days
      else {
        setScheduleDays([...scheduleDays, day])
      }
    }
  }

  const daysOfWeek = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

  // Filter and search lists
  const filteredLists = useMemo(() => {
    let lists = data?.quickLists || []

    // Filter by status
    if (filterStatus === 'scheduled') {
      lists = lists.filter((l: any) => l.is_scheduled && l.status === 'ACTIVE')
    } else if (filterStatus === 'unscheduled') {
      lists = lists.filter((l: any) => !l.is_scheduled)
    }

    // Search filter
    if (listSearch.trim()) {
      const searchLower = listSearch.toLowerCase()
      lists = lists.filter(
        (l: any) =>
          l.name.toLowerCase().includes(searchLower) ||
          l.description?.toLowerCase().includes(searchLower)
      )
    }

    return lists
  }, [data?.quickLists, filterStatus, listSearch])

  // Calculate statistics (coerce item_count to number - API may return it as string from PostgreSQL COUNT)
  const stats = useMemo(() => {
    const lists = data?.quickLists || []
    const scheduledActive = lists.filter((l: any) => l.is_scheduled && l.status === 'ACTIVE')
    const nextScheduled = scheduledActive
      .filter((l: any) => l.next_execution_date)
      .sort((a: any, b: any) =>
        String(a.next_execution_date).localeCompare(String(b.next_execution_date))
      )[0]

    return {
      total: lists.length,
      scheduled: scheduledActive.length,
      active: lists.filter((l: any) => l.status === 'ACTIVE').length,
      totalItems: lists.reduce((sum: number, l: any) => sum + Number(l.item_count ?? 0), 0),
      nextScheduledName: nextScheduled?.name as string | undefined,
      nextScheduledDate: nextScheduled?.next_execution_date as string | undefined,
    }
  }, [data?.quickLists])

  // Format next execution date
  const formatNextExecution = (list: any) => {
    if (!list.next_execution_date) return null

    // Parse the date - handle various formats from PostgreSQL
    let date: Date | null = null
    const dateValue = list.next_execution_date

    try {
      // If it's already a Date object
      if (dateValue instanceof Date) {
        date = dateValue
      } else {
        // Convert to string and parse
        const dateStr = String(dateValue).trim()

        // Try different parsing strategies
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Pure YYYY-MM-DD format (PostgreSQL DATE type)
          // Split and create date in local timezone
          const [year, month, day] = dateStr.split('-').map(Number)
          date = new Date(year, month - 1, day)
        } else if (dateStr.includes('T') || dateStr.includes(' ')) {
          // ISO format or datetime string
          date = new Date(dateStr)
        } else {
          // Fallback: try parsing as-is
          date = new Date(dateStr)
        }
      }

      // Validate date
      if (!date || isNaN(date.getTime())) {
        // Last resort: try manual parsing
        const dateStr = String(dateValue)
        const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
        if (match) {
          const [, year, month, day] = match.map(Number)
          date = new Date(year, month - 1, day)
        }
      }

      // Final validation
      if (!date || isNaN(date.getTime())) {
        return null // Return null instead of "Invalid date" to hide it
      }

      // Format date nicely
      const formattedDate = date.toLocaleDateString(dateLocale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      // Format time if available (preferred_time is TIME type: HH:MM:SS or HH:MM)
      if (list.preferred_time) {
        const timeStr = String(list.preferred_time)
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1], 10)
          const minutes = parseInt(timeMatch[2], 10)
          const timeDate = new Date(date)
          timeDate.setHours(hours, minutes, 0, 0)
          const formattedTime = timeDate.toLocaleTimeString(dateLocale, {
            hour: 'numeric',
            minute: '2-digit',
          })
          return t('quickLists.nextExecutionAt', { date: formattedDate, time: formattedTime })
        }
      }

      return formattedDate
    } catch (error) {
      console.error('Error formatting date:', error, dateValue)
      return null
    }
  }

  // Format frequency text
  const formatFrequency = (freq: string, _days?: any) => {
    switch (freq) {
      case 'DAILY':
        return t('quickLists.frequencyDaily')
      case 'WEEKLY':
        return t('quickLists.frequencyWeekly')
      case 'WEEKLY_3X':
        return t('quickLists.frequencyWeekly3x')
      case 'BIWEEKLY':
        return t('quickLists.frequencyBiweekly')
      case 'MONTHLY':
        return t('quickLists.frequencyMonthly')
      default:
        return freq
    }
  }

  const handleUnschedule = async (listId: string, listName: string) => {
    if (!confirm(t('quickLists.confirmUnschedule', { name: listName }))) return

    try {
      await unscheduleQuickList(listId).unwrap()
      toast.success(t('quickLists.toastUnscheduled', { name: listName }))
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('quickLists.toastUnscheduleFailed'))
    }
  }

  const handleViewDetails = (list: any) => {
    setSelectedListForDetails(list)
    setShowListDetails(true)
  }

  if (isLoading) {
    return (
      <PageShell data-testid="quick-lists-loading">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-6 w-14" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </PageShell>
    )
  }

  const quickLists = data?.quickLists || []

  return (
    <RequirePermission permission="ORDERS_VIEW" title={t('quickLists.permissionTitle')}>
      <PageShell data-testid="quick-lists-page">
        {!quickListCreateGate.canUse && quickListCreateGate.limit != null && (
          <LimitExceededBanner
            limitKey="quick_lists"
            currentUsage={quickListCreateGate.current}
            limitValue={quickListCreateGate.limit}
            currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
            upgradeUrl="/app/settings?tab=subscription"
          />
        )}
        {quickListSchedulingEnabled &&
          scheduledQuickListGate.limit === 1 &&
          scheduledQuickListGate.canUse && (
            <p className="text-sm text-[var(--text-muted)] rounded-lg border border-[var(--app-border)] px-4 py-3">
              {t('quickLists.freePlanHint')}
            </p>
          )}
        {quickListSchedulingEnabled &&
          scheduledQuickListGate.limit != null &&
          !scheduledQuickListGate.canUse && (
            <LimitExceededBanner
              limitKey="scheduled_quick_lists"
              currentUsage={scheduledQuickListGate.current}
              limitValue={scheduledQuickListGate.limit}
              currentPlan={entitlementsData?.entitlements?.plan?.name ?? null}
              upgradeUrl="/app/settings?tab=subscription"
            />
          )}
        <PageHeader
          title={t('quickLists.pageTitle')}
          description={t('quickLists.pageDescription')}
          actions={
            <Button
              onClick={() => setShowCreateDialog(true)}
              disabled={!quickListCreateGate.canUse}
              title={quickListCreateGate.message || undefined}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('quickLists.createList')}
            </Button>
          }
        />

        <SummaryStrip
          testId="quick-lists-summary"
          metrics={[
            {
              label: t('quickLists.totalLists'),
              value: stats.total,
              hint:
                quickListCreateGate.limit != null
                  ? t('quickLists.onPlan', {
                      current: quickListCreateGate.current ?? stats.total,
                      limit: quickListCreateGate.limit,
                    })
                  : undefined,
              active: filterStatus === 'all' && stats.total > 0,
              onClick: stats.total > 0 ? () => setFilterStatus('all') : undefined,
            },
            {
              label: t('quickLists.scheduled'),
              value: stats.scheduled,
              tone: 'mint',
              hint:
                stats.nextScheduledName && stats.nextScheduledDate
                  ? t('quickLists.nextScheduled', {
                      name: stats.nextScheduledName,
                      date: stats.nextScheduledDate,
                    })
                  : quickListSchedulingEnabled && scheduledQuickListGate.limit != null
                    ? t('quickLists.slotsUsed', {
                        current: scheduledQuickListGate.current ?? stats.scheduled,
                        limit: scheduledQuickListGate.limit,
                      })
                    : t('quickLists.autoOrderCadence'),
              active: filterStatus === 'scheduled',
              onClick: stats.total > 0 ? () => setFilterStatus('scheduled') : undefined,
            },
            {
              label: t('quickLists.active'),
              value: stats.active,
              hint: t('quickLists.activeHint'),
            },
            {
              label: t('quickLists.totalItems'),
              value: stats.totalItems,
              hint:
                quickListItemGate.limit != null
                  ? t('quickLists.itemsPerListLimit', { limit: quickListItemGate.limit })
                  : t('quickLists.itemsAcrossLists'),
            },
          ]}
        />

        {quickLists.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:p-4">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <Input
                placeholder={t('quickLists.searchPlaceholder')}
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="h-10 w-full rounded-lg border-[var(--app-border-mid)] pl-10"
                aria-label={t('quickLists.searchAriaLabel')}
              />
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                size="sm"
                className="h-10 rounded-lg"
                onClick={() => setFilterStatus('all')}
              >
                <Filter className="h-4 w-4 mr-1.5" />
                {t('quickLists.filterAll')}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {stats.total}
                </Badge>
              </Button>
              <Button
                variant={filterStatus === 'scheduled' ? 'default' : 'outline'}
                size="sm"
                className="h-10 rounded-lg"
                onClick={() => setFilterStatus('scheduled')}
              >
                <Clock className="h-4 w-4 mr-1.5" />
                {t('quickLists.filterScheduled')}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {stats.scheduled}
                </Badge>
              </Button>
              <Button
                variant={filterStatus === 'unscheduled' ? 'default' : 'outline'}
                size="sm"
                className="h-10 rounded-lg"
                onClick={() => setFilterStatus('unscheduled')}
              >
                <Package className="h-4 w-4 mr-1.5" />
                {t('quickLists.filterManual')}
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                  {stats.total - stats.scheduled}
                </Badge>
              </Button>
            </div>
          </div>
        )}

        {quickLists.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              title={t('quickLists.emptyTitle')}
              description={t('quickLists.emptyDescription')}
              icon={<List className="h-6 w-6" aria-hidden />}
              action={
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  disabled={!quickListCreateGate.canUse}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('quickLists.createFirstList')}
                </Button>
              }
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  step: '1',
                  title: t('quickLists.step1Title'),
                  body: t('quickLists.step1Body'),
                  icon: Package,
                },
                {
                  step: '2',
                  title: t('quickLists.step2Title'),
                  body: quickListSchedulingEnabled
                    ? t('quickLists.step2BodyScheduled')
                    : t('quickLists.step2BodyUpgrade'),
                  icon: Calendar,
                },
                {
                  step: '3',
                  title: t('quickLists.step3Title'),
                  body: t('quickLists.step3Body'),
                  icon: Zap,
                },
              ].map(({ step, title, body, icon: Icon }) => (
                <div
                  key={step}
                  className="rounded-xl border border-[var(--app-border-mid)] bg-[var(--surface)] p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand-pale)] text-xs font-bold text-[var(--brand-mid)]">
                      {step}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
                    <span className="text-sm font-semibold text-[var(--text)]">{title}</span>
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--text-muted)]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : filteredLists.length === 0 ? (
          <EmptyState
            title={t('quickLists.noMatchTitle')}
            description={t('quickLists.noMatchDescription')}
            icon={<Search className="h-6 w-6" aria-hidden />}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setListSearch('')
                  setFilterStatus('all')
                }}
              >
                <X className="h-4 w-4 mr-2" />
                {t('quickLists.clearFilters')}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredLists.map((list: any) => (
              <Card key={list.id} className={`${cardShellClass} hover:shadow-lg transition-shadow`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="flex items-center gap-2 min-w-0 text-lg">
                        <Package className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" />
                        <span className="truncate">{list.name}</span>
                      </CardTitle>
                      <CardDescription className="mt-1 truncate">
                        {list.description || t('quickLists.noDescription')}
                      </CardDescription>
                    </div>
                    <CardStatusBadges className="shrink-0 max-w-[45%] justify-end">
                      {list.is_scheduled && list.status === 'ACTIVE' && (
                        <Badge className="bg-[var(--mint)] text-white flex items-center gap-1 text-[10px] px-1.5 py-0">
                          <Clock className="h-3 w-3 shrink-0" />
                          {t('quickLists.statusScheduled')}
                        </Badge>
                      )}
                      {list.is_scheduled && list.status === 'PAUSED' && (
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1 text-[10px] px-1.5 py-0"
                        >
                          <Pause className="h-3 w-3 shrink-0" />
                          {t('quickLists.statusPaused')}
                        </Badge>
                      )}
                    </CardStatusBadges>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Items Count */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-muted)]">
                        {t('quickLists.itemsLabel')}
                      </span>
                      <Badge variant="secondary" className="text-sm font-semibold">
                        {list.item_count || 0}
                      </Badge>
                    </div>

                    {/* Products List */}
                    {list.items && list.items.length > 0 ? (
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-medium text-[var(--text-muted)] mb-2">
                          {t('quickLists.productsLabel')}
                        </p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {list.items.slice(0, 5).map((item: any, itemIndex: number) => {
                            const product = catalogProducts.find(
                              (p: any) => p.id === item.product_id
                            )
                            return (
                              <div
                                key={`${list.id}-${item.id ?? item.product_id}-${itemIndex}`}
                                className="flex items-center justify-between text-xs p-1.5 bg-[var(--brand-ultra)] rounded"
                              >
                                <span className="font-medium text-[var(--text-mid)] flex-1 truncate">
                                  {product?.name ||
                                    item.product_name ||
                                    t('quickLists.unknownProduct')}
                                </span>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {parseFloat(item.quantity) || 1}
                                </Badge>
                              </div>
                            )
                          })}
                          {list.items.length > 5 && (
                            <p className="text-xs text-[var(--text-muted)] text-center pt-1">
                              {t('quickLists.moreProducts', { count: list.items.length - 5 })}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t pt-3">
                        <p className="text-xs text-[var(--text-muted)] text-center">
                          {t('quickLists.noProductsAdded')}
                        </p>
                      </div>
                    )}

                    {/* Scheduled Info */}
                    {list.is_scheduled && (
                      <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--brand-mid)] font-medium">
                            {t('quickLists.frequencyLabel')}
                          </span>
                          <span className="text-[var(--text)] font-semibold">
                            {formatFrequency(list.frequency, list.days_of_week)}
                          </span>
                        </div>
                        {list.next_execution_date && formatNextExecution(list) && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--brand-mid)] font-medium">
                              {t('quickLists.nextLabel')}
                            </span>
                            <span className="text-[var(--text)] font-semibold flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatNextExecution(list)}
                            </span>
                          </div>
                        )}
                        {list.last_execution_date && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[var(--brand-mid)] font-medium">
                              {t('quickLists.lastLabel')}
                            </span>
                            <span className="text-[var(--text)]">
                              {new Date(list.last_execution_date).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <CardActionGrid>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetails(list)}
                        className={cardActionBtnClass()}
                      >
                        <Eye className="h-4 w-4 mr-1 shrink-0" />
                        {t('quickLists.view')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddProducts(list.id)}
                        className={cardActionBtnClass({ iconOnly: true })}
                        aria-label={t('quickLists.addProducts')}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOrderFromList(list.id)}
                        disabled={!list || !list.items || list.items.length === 0}
                        className={cardActionBtnClass()}
                      >
                        <ShoppingCart className="h-4 w-4 mr-1 shrink-0" />
                        {t('quickLists.order')}
                      </Button>
                      {aiSuggestAllowed && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSuggesting}
                          onClick={() => handleSuggestItems(list)}
                          className={cardActionBtnClass()}
                        >
                          <Zap className="h-4 w-4 mr-1 shrink-0" />
                          Suggest items
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteList(list.id, list.name)}
                        className={`${cardActionBtnClass({ iconOnly: true })} text-[var(--red)] hover:text-[var(--red)]`}
                        aria-label={t('quickLists.deleteList')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {(quickListSchedulingEnabled || list.is_scheduled) &&
                        (list.is_scheduled ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleScheduleOrder(list)}
                              className={cardActionBtnClass({ span: 'full' })}
                            >
                              <Edit className="h-4 w-4 mr-1 shrink-0" />
                              {t('quickLists.editSchedule')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnschedule(list.id, list.name)}
                              className={`${cardActionBtnClass({ iconOnly: true })} text-[var(--amber)] hover:text-[var(--amber-mid)]`}
                              aria-label={t('quickLists.pauseSchedule')}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleScheduleOrder(list)}
                            className={cardActionBtnClass({ span: 'full' })}
                            disabled={
                              !getQuickListScheduleGate(entitlementsData?.entitlements, false)
                                .canSchedule
                            }
                            title={
                              getQuickListScheduleGate(entitlementsData?.entitlements, false)
                                .message || undefined
                            }
                          >
                            <Clock className="h-4 w-4 mr-1 shrink-0" />
                            {t('quickLists.scheduleOrder')}
                          </Button>
                        ))}
                    </CardActionGrid>

                    {list.created_at && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('quickLists.created', {
                          date: new Date(list.created_at).toLocaleDateString(),
                        })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Suspense fallback={null}>
          {showCreateDialog && (
            <LazyQuickListCreateDialog
              {...{
                showCreateDialog,
                setShowCreateDialog,
                newListName,
                setNewListName,
                newListDescription,
                setNewListDescription,
                handleCreateList,
              }}
            />
          )}
          {showProductDialog && (
            <LazyQuickListProductDialog
              {...{
                showProductDialog,
                setShowProductDialog,
                productSearch,
                setProductSearch,
                filteredProducts,
                handleAddProductToList,
              }}
            />
          )}
          {showScheduledOrder && (
            <LazyQuickListScheduleDialog
              {...{
                showScheduledOrder,
                setShowScheduledOrder,
                selectedListForSchedule,
                setSelectedListForSchedule,
                scheduleFrequency,
                setScheduleFrequency,
                scheduleDays,
                setScheduleDays,
                scheduleTime,
                setScheduleTime,
                autoCreateOrder,
                setAutoCreateOrder,
                useAiQuantities,
                setUseAiQuantities,
                showSmartQuantities: smartQuantitiesAllowed,
                handleCreateScheduledOrder,
                daysOfWeek,
                toggleScheduleDay,
              }}
            />
          )}
          {showListDetails && (
            <LazyQuickListDetailsDialog
              {...{
                showListDetails,
                setShowListDetails,
                selectedListForDetails,
                selectedListDetails,
                catalogProducts,
                formatFrequency,
                formatNextExecution,
                handleOrderFromList,
                handleAddProducts,
              }}
            />
          )}
        </Suspense>
      </PageShell>
    </RequirePermission>
  )
}
