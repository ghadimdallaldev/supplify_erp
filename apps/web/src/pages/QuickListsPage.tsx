import { useState, useMemo } from 'react'
import {
  useGetQuickListsQuery,
  useCreateQuickListMutation,
  useDeleteQuickListMutation,
  useGetProductsQuery,
  useAddItemToQuickListMutation,
  useScheduleQuickListMutation,
  useUnscheduleQuickListMutation,
  useGetQuickListQuery,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import {
  CardActionGrid,
  CardStatusBadges,
  cardActionBtnClass,
  cardShellClass,
  pageHeaderRowClass,
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
  Repeat,
  Calendar,
  CheckCircle,
  Pause,
  Play,
  Eye,
  Filter,
  Zap,
  TrendingUp,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import toast from 'react-hot-toast'
import { useAppDispatch } from '../hooks/redux'
import { useCartActions } from '../hooks/useCartActions'
import { useNavigate } from 'react-router-dom'
import { formatPrice } from '../utils/format'
import { useGetEntitlementsQuery } from '../services/api'
import {
  getPlanLimitGate,
  isQuickListSchedulingEnabled,
  getQuickListScheduleGate,
} from '../lib/planLimits'
import { LimitExceededBanner } from '../components/LimitExceededBanner'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../utils/parseDaysOfWeek'

export function QuickListsPage() {
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

  const dispatch = useAppDispatch()
  const { addItem } = useCartActions()
  const navigate = useNavigate()

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const quickListSchedulingEnabled = isQuickListSchedulingEnabled(entitlementsData?.entitlements)
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
  const [unscheduleQuickList] = useUnscheduleQuickListMutation()

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error('Please enter a list name')
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
      toast.success('Quick list created!')
      setShowCreateDialog(false)
      setNewListName('')
      setNewListDescription('')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create quick list')
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
      toast.success(`Added ${product.name} to list!`)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to add product')
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
    if (!confirm(`Are you sure you want to delete "${listName}"?`)) return

    try {
      await deleteQuickList(listId).unwrap()
      toast.success('Quick list deleted')
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to delete quick list')
    }
  }

  const handleOrderFromList = async (listId: string) => {
    const list = quickLists.find((l: any) => l.id === listId)
    if (!list) {
      toast.error('List not found')
      return
    }

    // If list doesn't have items array, fetch it from API
    if (!list.items || list.items.length === 0) {
      toast.error('This list has no items')
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

      toast.success(`Added ${list.items?.length || 0} items from "${list.name}" to cart!`)

      // Optionally navigate to cart
      setTimeout(() => {
        navigate('/app/cart')
      }, 500)
    } catch (error) {
      toast.error('Failed to add items to cart')
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
    } else {
      // Reset to defaults when creating new schedule
      setScheduleFrequency('WEEKLY')
      setScheduleDays(['MONDAY'])
      setScheduleTime('09:00')
      setAutoCreateOrder(true)
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
        },
      }).unwrap()

      toast.success(`Scheduled "${selectedListForSchedule.name}" successfully!`, {
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
          ? `Plan limit reached (${apiError?.details?.limitKey ?? 'limit'}). Upgrade for more.`
          : apiError?.name === 'FEATURE_NOT_AVAILABLE'
            ? 'Scheduled quick lists require Silver or higher on your current plan.'
            : 'Failed to schedule order')
      toast.error(message)
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
          toast.error('You can only select up to 3 days for "Three times per week"')
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
    return {
      total: lists.length,
      scheduled: lists.filter((l: any) => l.is_scheduled && l.status === 'ACTIVE').length,
      active: lists.filter((l: any) => l.status === 'ACTIVE').length,
      totalItems: lists.reduce((sum: number, l: any) => sum + Number(l.item_count ?? 0), 0),
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
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })

      // Format time if available (preferred_time is TIME type: HH:MM:SS or HH:MM)
      if (list.preferred_time) {
        const timeStr = String(list.preferred_time)
        // Extract hours and minutes (handle both HH:MM:SS and HH:MM formats)
        const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1])
          const minutes = timeMatch[2]
          // Format as 12-hour time
          const period = hours >= 12 ? 'PM' : 'AM'
          const displayHours = hours % 12 || 12
          const formattedTime = `${displayHours}:${minutes} ${period}`
          return `${formattedDate} at ${formattedTime}`
        }
      }

      return formattedDate
    } catch (error) {
      console.error('Error formatting date:', error, dateValue)
      return null
    }
  }

  // Format frequency text
  const formatFrequency = (freq: string, days?: any) => {
    switch (freq) {
      case 'DAILY':
        return 'Daily'
      case 'WEEKLY':
        return 'Weekly'
      case 'WEEKLY_3X':
        return '3x per week'
      case 'BIWEEKLY':
        return 'Biweekly'
      case 'MONTHLY':
        return 'Monthly'
      default:
        return freq
    }
  }

  const handleUnschedule = async (listId: string, listName: string) => {
    if (!confirm(`Are you sure you want to unschedule "${listName}"?`)) return

    try {
      await unscheduleQuickList(listId).unwrap()
      toast.success(`"${listName}" unscheduled successfully`)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to unschedule')
    }
  }

  const handleViewDetails = (list: any) => {
    setSelectedListForDetails(list)
    setShowListDetails(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  const quickLists = data?.quickLists || []

  return (
    <div className="space-y-6 p-6" data-testid="quick-lists-page">
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
            Free plan includes 1 scheduled quick list. Upgrade to Silver for more scheduled lists
            and full automation.
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
      <div className={pageHeaderRowClass}>
        <div className="min-w-0">
          <h1 className="text-[21px] font-black text-[var(--text)]">Quick Lists</h1>
          <p className="text-[var(--text-muted)] mt-2">
            Create lists for recurring orders and save time
          </p>
        </div>
        <Button
          className="shrink-0 whitespace-normal"
          onClick={() => setShowCreateDialog(true)}
          disabled={!quickListCreateGate.canUse}
          title={quickListCreateGate.message || undefined}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create List
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-muted)]">Total Lists</p>
                <p className="text-2xl font-bold text-[var(--text)]">{stats.total}</p>
              </div>
              <Package className="h-8 w-8 text-[var(--brand-mid)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-muted)]">Scheduled</p>
                <p className="text-2xl font-bold text-[var(--text)]">{stats.scheduled}</p>
              </div>
              <Clock className="h-8 w-8 text-[var(--mint)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-muted)]">Active</p>
                <p className="text-2xl font-bold text-[var(--text)]">{stats.active}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-[var(--brand-mid)]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-muted)]">Total Items</p>
                <p className="text-2xl font-bold text-[var(--text)]">{stats.totalItems}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-[var(--amber-mid)]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      {quickLists.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  placeholder="Search quick lists..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  All
                </Button>
                <Button
                  variant={filterStatus === 'scheduled' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('scheduled')}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Scheduled
                </Button>
                <Button
                  variant={filterStatus === 'unscheduled' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('unscheduled')}
                >
                  <Package className="h-4 w-4 mr-1" />
                  Unscheduled
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Lists Grid */}
      {quickLists.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <List className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[var(--text)] mb-2">No quick lists yet</h3>
              <p className="text-[var(--text-muted)] mb-6">
                Create your first quick list to save products for recurring orders
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Quick List
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : filteredLists.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <Search className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[var(--text)] mb-2">No lists found</h3>
              <p className="text-[var(--text-muted)] mb-6">
                Try adjusting your search or filter criteria
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setListSearch('')
                  setFilterStatus('all')
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                      {list.description || 'No description'}
                    </CardDescription>
                  </div>
                  <CardStatusBadges className="shrink-0 max-w-[45%] justify-end">
                    {list.is_scheduled && list.status === 'ACTIVE' && (
                      <Badge className="bg-[var(--mint)] text-white flex items-center gap-1 text-[10px] px-1.5 py-0">
                        <Clock className="h-3 w-3 shrink-0" />
                        Scheduled
                      </Badge>
                    )}
                    {list.is_scheduled && list.status === 'PAUSED' && (
                      <Badge
                        variant="secondary"
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0"
                      >
                        <Pause className="h-3 w-3 shrink-0" />
                        Paused
                      </Badge>
                    )}
                  </CardStatusBadges>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Items Count */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[var(--text-muted)]">Items</span>
                    <Badge variant="secondary" className="text-sm font-semibold">
                      {list.item_count || 0}
                    </Badge>
                  </div>

                  {/* Products List */}
                  {list.items && list.items.length > 0 ? (
                    <div className="border-t pt-3 space-y-2">
                      <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Products:</p>
                      <div className="space-y-1.5 max-h-32 overflow-y-auto">
                        {list.items.slice(0, 5).map((item: any, itemIndex: number) => {
                          const product = catalogProducts.find((p: any) => p.id === item.product_id)
                          return (
                            <div
                              key={`${list.id}-${item.id ?? item.product_id}-${itemIndex}`}
                              className="flex items-center justify-between text-xs p-1.5 bg-[var(--brand-ultra)] rounded"
                            >
                              <span className="font-medium text-[var(--text-mid)] flex-1 truncate">
                                {product?.name || item.product_name || 'Unknown Product'}
                              </span>
                              <Badge variant="outline" className="ml-2 text-xs">
                                {parseFloat(item.quantity) || 1}
                              </Badge>
                            </div>
                          )
                        })}
                        {list.items.length > 5 && (
                          <p className="text-xs text-[var(--text-muted)] text-center pt-1">
                            +{list.items.length - 5} more
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border-t pt-3">
                      <p className="text-xs text-[var(--text-muted)] text-center">
                        No products added
                      </p>
                    </div>
                  )}

                  {/* Scheduled Info */}
                  {list.is_scheduled && (
                    <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--brand-mid)] font-medium">Frequency:</span>
                        <span className="text-[var(--text)] font-semibold">
                          {formatFrequency(list.frequency, list.days_of_week)}
                        </span>
                      </div>
                      {list.next_execution_date && formatNextExecution(list) && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--brand-mid)] font-medium">Next:</span>
                          <span className="text-[var(--text)] font-semibold flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatNextExecution(list)}
                          </span>
                        </div>
                      )}
                      {list.last_execution_date && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[var(--brand-mid)] font-medium">Last:</span>
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
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddProducts(list.id)}
                      className={cardActionBtnClass({ iconOnly: true })}
                      aria-label="Add products"
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
                      Order
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteList(list.id, list.name)}
                      className={`${cardActionBtnClass({ iconOnly: true })} text-[var(--red)] hover:text-[var(--red)]`}
                      aria-label="Delete list"
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
                            Edit Schedule
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUnschedule(list.id, list.name)}
                            className={`${cardActionBtnClass({ iconOnly: true })} text-[var(--amber)] hover:text-[var(--amber-mid)]`}
                            aria-label="Pause schedule"
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
                          Schedule Order
                        </Button>
                      ))}
                  </CardActionGrid>

                  {list.created_at && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Created {new Date(list.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create List Dialog */}
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

      {/* Product Selection Dialog */}
      <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Products to List</DialogTitle>
            <DialogDescription>
              Search and select products to add to your quick list
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Product List */}
            <div className="border rounded-md max-h-96 overflow-y-auto divide-y">
              {filteredProducts?.map((product: any, productIndex: number) => (
                <div
                  key={`${product.id}-${product.supplier_id ?? productIndex}`}
                  className="flex items-center justify-between p-4 hover:bg-[var(--brand-ultra)]"
                >
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">{product.sku}</p>
                    <p className="text-sm font-semibold text-[var(--mint)]">
                      {formatPrice(product.price)} / {product.unit}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => handleAddProductToList(product)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              ))}

              {(!filteredProducts || filteredProducts.length === 0) && (
                <div className="text-center py-8 text-[var(--text-muted)]">No products found</div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scheduled Order Dialog */}
      <Dialog open={showScheduledOrder} onOpenChange={setShowScheduledOrder}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Schedule Recurring Order</DialogTitle>
            <DialogDescription>
              Set up automatic ordering from "{selectedListForSchedule?.name}"
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Frequency</Label>
              <select
                className="w-full px-3 py-2 border border-[var(--app-border-mid)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)] mt-2"
                value={scheduleFrequency}
                onChange={(e) => {
                  const newFrequency = e.target.value as any
                  setScheduleFrequency(newFrequency)

                  // Adjust days based on new frequency
                  if (newFrequency === 'WEEKLY') {
                    // Once per week: keep only first day or default to MONDAY
                    setScheduleDays(scheduleDays.length > 0 ? [scheduleDays[0]] : ['MONDAY'])
                  } else if (newFrequency === 'WEEKLY_3X') {
                    // Three times per week: limit to first 3 days or default to Mon, Wed, Fri
                    if (scheduleDays.length > 3) {
                      setScheduleDays(scheduleDays.slice(0, 3))
                    } else if (scheduleDays.length === 0) {
                      setScheduleDays(['MONDAY', 'WEDNESDAY', 'FRIDAY'])
                    }
                  }
                }}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Once per week</option>
                <option value="WEEKLY_3X">Three times per week</option>
                <option value="BIWEEKLY">Biweekly (Every 2 weeks)</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>

            {(scheduleFrequency === 'WEEKLY' ||
              scheduleFrequency === 'WEEKLY_3X' ||
              scheduleFrequency === 'BIWEEKLY') && (
              <div>
                <Label>
                  {scheduleFrequency === 'WEEKLY'
                    ? 'Select One Day'
                    : scheduleFrequency === 'WEEKLY_3X'
                      ? `Select up to 3 Days (${scheduleDays.length} selected)`
                      : `Days of Week (${scheduleDays.length} selected)`}
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {daysOfWeek.map((day) => {
                    const isSelected = scheduleDays.includes(day)
                    const isDisabled =
                      (scheduleFrequency === 'WEEKLY_3X' &&
                        !isSelected &&
                        scheduleDays.length >= 3) ||
                      (scheduleFrequency === 'WEEKLY' && !isSelected && scheduleDays.length >= 1)

                    return (
                      <label
                        key={day}
                        className={`flex items-center p-2 border rounded-md transition-colors ${
                          isSelected
                            ? 'bg-[var(--brand)] text-white border-[var(--brand)] cursor-pointer'
                            : isDisabled
                              ? 'bg-[var(--brand-ultra)] text-[var(--text-muted)] border-[var(--app-border)] cursor-not-allowed'
                              : 'bg-white border-[var(--app-border-mid)] hover:bg-[var(--brand-ultra)] cursor-pointer'
                        }`}
                      >
                        <input
                          type={scheduleFrequency === 'WEEKLY' ? 'radio' : 'checkbox'}
                          name={scheduleFrequency === 'WEEKLY' ? 'weeklyDay' : undefined}
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => toggleScheduleDay(day)}
                          className="sr-only"
                        />
                        <span className="text-sm">
                          {day.charAt(0) + day.slice(1).toLowerCase()}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {scheduleDays.length === 0 && (
                  <p className="text-sm text-[var(--red)] mt-1">Please select at least one day</p>
                )}
                {scheduleFrequency === 'WEEKLY' && scheduleDays.length > 0 && (
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Selecting a different day will replace the current selection
                  </p>
                )}
                {scheduleFrequency === 'WEEKLY_3X' && scheduleDays.length >= 3 && (
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Maximum of 3 days selected. Deselect a day to select a different one.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Preferred Time</Label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="mt-2"
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoCreate"
                checked={autoCreateOrder}
                onChange={(e) => setAutoCreateOrder(e.target.checked)}
                className="w-4 h-4"
              />
              <Label htmlFor="autoCreate" className="cursor-pointer">
                Automatically create orders
              </Label>
            </div>

            <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
              <p className="text-sm text-[var(--brand-mid)]">
                <strong>Note:</strong> Orders will be{' '}
                {autoCreateOrder ? 'automatically created' : 'reminders sent'} for "
                {selectedListForSchedule?.name}"{scheduleFrequency === 'DAILY' && ' every day'}
                {scheduleFrequency === 'WEEKLY' && ` every week on ${scheduleDays.join(', ')}`}
                {scheduleFrequency === 'WEEKLY_3X' &&
                  ` 3 times per week on ${scheduleDays.join(', ')}`}
                {scheduleFrequency === 'BIWEEKLY' && ` every 2 weeks on ${scheduleDays.join(', ')}`}
                {scheduleFrequency === 'MONTHLY' && ' on the same date each month'} at{' '}
                {scheduleTime}.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowScheduledOrder(false)
                setSelectedListForSchedule(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateScheduledOrder}
              disabled={
                (scheduleFrequency === 'WEEKLY' ||
                  scheduleFrequency === 'WEEKLY_3X' ||
                  scheduleFrequency === 'BIWEEKLY') &&
                scheduleDays.length === 0
              }
            >
              <Repeat className="h-4 w-4 mr-2" />
              Schedule Recurring Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List Details Dialog */}
      <Dialog open={showListDetails} onOpenChange={setShowListDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedListForDetails?.name}</DialogTitle>
            <DialogDescription>
              {selectedListForDetails?.description || 'View quick list details and items'}
            </DialogDescription>
          </DialogHeader>

          {selectedListDetails && (
            <div className="space-y-4">
              {/* Schedule Info */}
              {selectedListDetails.is_scheduled && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Schedule Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Status:</span>
                      <Badge
                        variant={selectedListDetails.status === 'ACTIVE' ? 'default' : 'secondary'}
                      >
                        {selectedListDetails.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Frequency:</span>
                      <span className="text-sm font-medium">
                        {formatFrequency(
                          selectedListDetails.frequency,
                          selectedListDetails.days_of_week
                        )}
                      </span>
                    </div>
                    {(() => {
                      const detailDays = parseDaysOfWeek(selectedListDetails.days_of_week)
                      if (!detailDays.length) return null
                      return (
                        <div className="flex justify-between">
                          <span className="text-sm text-[var(--text-muted)]">Days:</span>
                          <span className="text-sm font-medium">
                            {formatDaysOfWeekLabel(detailDays)}
                          </span>
                        </div>
                      )
                    })()}
                    {selectedListDetails.preferred_time && (
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Preferred Time:</span>
                        <span className="text-sm font-medium">
                          {selectedListDetails.preferred_time.slice(0, 5)}
                        </span>
                      </div>
                    )}
                    {selectedListDetails.next_execution_date &&
                      formatNextExecution(selectedListDetails) && (
                        <div className="flex justify-between">
                          <span className="text-sm text-[var(--text-muted)]">Next Execution:</span>
                          <span className="text-sm font-medium">
                            {formatNextExecution(selectedListDetails)}
                          </span>
                        </div>
                      )}
                    {selectedListDetails.last_execution_date && (
                      <div className="flex justify-between">
                        <span className="text-sm text-[var(--text-muted)]">Last Execution:</span>
                        <span className="text-sm font-medium">
                          {new Date(selectedListDetails.last_execution_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm text-[var(--text-muted)]">Auto Create Order:</span>
                      <Badge
                        variant={selectedListDetails.auto_create_order ? 'default' : 'secondary'}
                      >
                        {selectedListDetails.auto_create_order ? 'Yes' : 'No'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Items List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Items ({selectedListDetails.items?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedListDetails.items && selectedListDetails.items.length > 0 ? (
                    <div className="space-y-3">
                      {selectedListDetails.items.map((item: any, itemIndex: number) => {
                        const product = catalogProducts.find((p: any) => p.id === item.product_id)
                        return (
                          <div
                            key={`${selectedListForDetails?.id ?? 'list'}-${item.id ?? item.product_id}-${itemIndex}`}
                            className="flex items-center justify-between p-3 border rounded-md"
                          >
                            <div className="flex-1">
                              <p className="font-medium">{product?.name || 'Product not found'}</p>
                              {product?.sku && (
                                <p className="text-sm text-[var(--text-muted)]">
                                  SKU: {product.sku}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">Qty: {item.quantity}</p>
                              {product?.price && (
                                <p className="text-sm text-[var(--text-muted)]">
                                  {formatPrice(Number(product.price) * item.quantity)}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[var(--text-muted)]">
                      <Package className="h-12 w-12 mx-auto mb-2 text-[var(--text-muted)]" />
                      <p>No items in this list</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-4"
                        onClick={() => {
                          setShowListDetails(false)
                          handleAddProducts(selectedListForDetails.id)
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Items
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListDetails(false)}>
              Close
            </Button>
            {selectedListForDetails && (
              <Button
                onClick={() => {
                  setShowListDetails(false)
                  handleOrderFromList(selectedListForDetails.id)
                }}
                disabled={
                  !selectedListDetails ||
                  !selectedListDetails.items ||
                  selectedListDetails.items.length === 0
                }
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Order Now
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
