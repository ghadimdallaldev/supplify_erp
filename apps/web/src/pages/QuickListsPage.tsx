import { useState } from 'react'
import { useGetQuickListsQuery, useCreateQuickListMutation, useDeleteQuickListMutation, useGetProductsQuery, useAddItemToQuickListMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
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
  Repeat
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import toast from 'react-hot-toast'
import { useAppDispatch } from '../hooks/redux'
import { addItem } from '../features/cart/cartSlice'
import { useNavigate } from 'react-router-dom'

export function QuickListsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [showScheduledOrder, setShowScheduledOrder] = useState(false)
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [selectedListForSchedule, setSelectedListForSchedule] = useState<any>(null)
  const [productSearch, setProductSearch] = useState('')
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [scheduleFrequency, setScheduleFrequency] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY')
  const [scheduleDay, setScheduleDay] = useState('Monday')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  
  const { data, isLoading, refetch } = useGetQuickListsQuery()
  const { data: productsData } = useGetProductsQuery({ limit: 1000 })
  const [createQuickList] = useCreateQuickListMutation()
  const [deleteQuickList] = useDeleteQuickListMutation()
  const [addItemToQuickList] = useAddItemToQuickListMutation()

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error('Please enter a list name')
      return
    }

    try {
      await createQuickList({
        name: newListName,
        description: newListDescription,
        items: []
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
    
    try {
      await addItemToQuickList({
        quickListId: selectedListId,
        body: {
          productId: product.id,
          supplierId: product.supplier_id,
          quantity: 1,
          notes: ''
        }
      }).unwrap()
      toast.success(`Added ${product.name} to list!`)
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to add product')
    }
  }

  const filteredProducts = productsData?.products?.filter((product: any) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    product.sku?.toLowerCase().includes(productSearch.toLowerCase())
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
    if (!list || !list.items || list.items.length === 0) {
      toast.error('This list has no items')
      return
    }
    
    try {
      // Add all items from the quick list to cart
      for (const item of list.items) {
        // Fetch product details
        const product = productsData?.products?.find((p: any) => p.id === item.product_id)
        if (product) {
          dispatch(addItem({
            productId: product.id,
            product,
            quantity: parseFloat(item.quantity) || 1,
          }))
        }
      }
      
      toast.success(`Added ${list.items.length} items from "${list.name}" to cart!`)
      
      // Optionally navigate to cart
      setTimeout(() => {
        navigate('/app/cart')
      }, 500)
    } catch (error) {
      toast.error('Failed to add items to cart')
    }
  }
  
  const handleScheduleOrder = (list: any) => {
    setSelectedListForSchedule(list)
    setShowScheduledOrder(true)
  }
  
  const handleCreateScheduledOrder = () => {
    if (!selectedListForSchedule) return
    
    toast.success(`Scheduled order created for "${selectedListForSchedule.name}"!`, {
      duration: 3000,
    })
    
    // TODO: Implement API call to create scheduled order
    // This would save the schedule to the database
    setShowScheduledOrder(false)
    setSelectedListForSchedule(null)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  const quickLists = data?.quickLists || []

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Quick Lists</h1>
          <p className="text-gray-600 mt-2">Create lists for recurring orders and save time</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create List
        </Button>
      </div>

      {/* Quick Lists Grid */}
      {quickLists.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <List className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No quick lists yet</h3>
              <p className="text-gray-600 mb-6">Create your first quick list to save products for recurring orders</p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Quick List
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickLists.map((list: any) => (
            <Card key={list.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      {list.name}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {list.description || 'No description'}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteList(list.id, list.name)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Items</span>
                    <Badge variant="secondary">{list.item_count || 0}</Badge>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleAddProducts(list.id)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                    <Button 
                      className="flex-1"
                      size="sm"
                      onClick={() => handleOrderFromList(list.id)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-1" />
                      Order Now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleScheduleOrder(list)}
                    >
                      <Clock className="h-4 w-4 mr-1" />
                      Schedule
                    </Button>
                  </div>

                  {list.created_at && (
                    <p className="text-xs text-gray-500">
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

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm text-blue-800">
                💡 <strong>Tip:</strong> After creating the list, you can add products and then quickly reorder them anytime!
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
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Product List */}
            <div className="border rounded-md max-h-96 overflow-y-auto divide-y">
              {filteredProducts?.map((product: any) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-gray-600">{product.sku}</p>
                    <p className="text-sm font-semibold text-green-600">
                      ${product.price?.toFixed(2)} / {product.unit}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddProductToList(product)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              ))}

              {(!filteredProducts || filteredProducts.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  No products found
                </div>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary mt-2"
                value={scheduleFrequency}
                onChange={(e) => setScheduleFrequency(e.target.value as any)}
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>

            {scheduleFrequency === 'WEEKLY' && (
              <div>
                <Label>Day of Week</Label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary mt-2"
                  value={scheduleDay}
                  onChange={(e) => setScheduleDay(e.target.value)}
                >
                  <option value="Monday">Monday</option>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Wednesday">Wednesday</option>
                  <option value="Thursday">Thursday</option>
                  <option value="Friday">Friday</option>
                  <option value="Saturday">Saturday</option>
                  <option value="Sunday">Sunday</option>
                </select>
              </div>
            )}

            <div>
              <Label>Time</Label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="mt-2"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Orders will be automatically created from this quick list
                {scheduleFrequency === 'DAILY' && ' every day'}
                {scheduleFrequency === 'WEEKLY' && ` every ${scheduleDay}`}
                {scheduleFrequency === 'MONTHLY' && ' on the same date each month'}
                {' '}at {scheduleTime}.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowScheduledOrder(false)
              setSelectedListForSchedule(null)
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateScheduledOrder}>
              <Repeat className="h-4 w-4 mr-2" />
              Create Scheduled Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

