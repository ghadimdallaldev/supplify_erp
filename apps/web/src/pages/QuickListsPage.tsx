import { useState } from 'react'
import { useGetQuickListsQuery, useCreateQuickListMutation, useDeleteQuickListMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { 
  List, 
  Plus, 
  ShoppingCart,
  Trash2,
  Edit,
  Package
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import toast from 'react-hot-toast'

export function QuickListsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  
  const { data, isLoading, refetch } = useGetQuickListsQuery()
  const [createQuickList] = useCreateQuickListMutation()
  const [deleteQuickList] = useDeleteQuickListMutation()

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      toast.error('Please enter a list name')
      return
    }

    // For now, show a message that items can be added after creation
    toast.success(`Quick list "${newListName}" would be created! (Items can be added in the next step)`)
    setShowCreateDialog(false)
    setNewListName('')
    setNewListDescription('')
    
    // TODO: Implement actual API call
    // try {
    //   await createQuickList({
    //     name: newListName,
    //     description: newListDescription,
    //     items: []
    //   }).unwrap()
    //   toast.success('Quick list created!')
    //   setShowCreateDialog(false)
    //   refetch()
    // } catch (error: any) {
    //   toast.error(error?.data?.error?.message || 'Failed to create quick list')
    // }
  }

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

  const handleOrderFromList = (listId: string) => {
    toast.success('Ordering from quick list! (Feature coming soon)')
    // TODO: Implement "Order from List" functionality
    // This would:
    // 1. Get list items
    // 2. Create cart items from list
    // 3. Navigate to cart or create order directly
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  const quickLists = data?.data?.quickLists || []

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
                      className="flex-1"
                      onClick={() => toast.info('Edit feature coming soon')}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button 
                      className="flex-1"
                      onClick={() => handleOrderFromList(list.id)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Order
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
    </div>
  )
}

