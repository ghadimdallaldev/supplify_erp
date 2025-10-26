import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Building2, Warehouse, MapPin, FileText, Clock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export function SupplierSettingsPage() {
  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const [showAddZone, setShowAddZone] = useState(false)
  
  // Warehouse form state
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    country: '',
    isMain: false,
  })
  
  // Delivery zone form state
  const [zoneForm, setZoneForm] = useState({
    name: '',
    deliveryFee: '',
    minOrderAmount: '',
    deliveryTimeDays: '',
  })

  const handleAddWarehouse = () => {
    // TODO: Implement API call to add warehouse
    console.log('Adding warehouse:', warehouseForm)
    toast.success('Warehouse added successfully!')
    setShowAddWarehouse(false)
    setWarehouseForm({
      name: '',
      code: '',
      address: '',
      city: '',
      country: '',
      isMain: false,
    })
  }

  const handleAddZone = () => {
    // TODO: Implement API call to add delivery zone
    console.log('Adding delivery zone:', zoneForm)
    toast.success('Delivery zone added successfully!')
    setShowAddZone(false)
    setZoneForm({
      name: '',
      deliveryFee: '',
      minOrderAmount: '',
      deliveryTimeDays: '',
    })
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Supplier Settings</h1>
        <p className="text-gray-600 mt-2">Manage your business profile and settings</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Zones</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Company Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Company Name</label>
                  <Input defaultValue="Fresh Produce Co" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Legal Name</label>
                  <Input defaultValue="Fresh Produce Co LLC" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">VAT Number</label>
                  <Input defaultValue="VAT-123456" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Trade License</label>
                  <Input defaultValue="TL-456789" />
                </div>
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Warehouse className="h-5 w-5" />
                    Warehouses
                  </CardTitle>
                  <CardDescription>Manage your warehouse locations</CardDescription>
                </div>
                <Button onClick={() => setShowAddWarehouse(true)}>Add Warehouse</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">Main Warehouse</h4>
                        <Badge>Main</Badge>
                      </div>
                      <p className="text-sm text-gray-600">WH-001</p>
                      <p className="text-sm text-gray-500">123 Farm Road, Agricultural City</p>
                    </div>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="delivery" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Delivery Zones
                  </CardTitle>
                  <CardDescription>Manage delivery coverage areas</CardDescription>
                </div>
                <Button onClick={() => setShowAddZone(true)}>Add Zone</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">Downtown Zone</h4>
                      <div className="text-sm text-gray-600 space-x-4 mt-1">
                        <span>Fee: $10</span>
                        <span>Min Order: $50</span>
                        <span>Delivery: 2 days</span>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">Edit</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Warehouse Dialog */}
      <Dialog open={showAddWarehouse} onOpenChange={setShowAddWarehouse}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Warehouse</DialogTitle>
            <DialogDescription>
              Create a new warehouse location for your business
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Warehouse Name *</label>
                <Input
                  placeholder="Main Warehouse"
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Warehouse Code *</label>
                <Input
                  placeholder="WH-001"
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <label className="text-sm font-medium">Street Address</label>
                <Input
                  placeholder="123 Farm Road"
                  value={warehouseForm.address}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">City</label>
                <Input
                  placeholder="Agricultural City"
                  value={warehouseForm.city}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Country</label>
                <Input
                  placeholder="USA"
                  value={warehouseForm.country}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, country: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2 col-span-2">
                <input
                  type="checkbox"
                  id="isMain"
                  checked={warehouseForm.isMain}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, isMain: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="isMain" className="text-sm font-medium">
                  Set as main warehouse
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWarehouse(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddWarehouse}>
              Add Warehouse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Delivery Zone Dialog */}
      <Dialog open={showAddZone} onOpenChange={setShowAddZone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Delivery Zone</DialogTitle>
            <DialogDescription>
              Create a new delivery coverage zone
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Zone Name *</label>
              <Input
                placeholder="Downtown Zone"
                value={zoneForm.name}
                onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Delivery Fee ($)</label>
                <Input
                  type="number"
                  placeholder="10.00"
                  value={zoneForm.deliveryFee}
                  onChange={(e) => setZoneForm({ ...zoneForm, deliveryFee: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Min Order Amount ($)</label>
                <Input
                  type="number"
                  placeholder="50.00"
                  value={zoneForm.minOrderAmount}
                  onChange={(e) => setZoneForm({ ...zoneForm, minOrderAmount: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Delivery Time (days)</label>
                <Input
                  type="number"
                  placeholder="2"
                  value={zoneForm.deliveryTimeDays}
                  onChange={(e) => setZoneForm({ ...zoneForm, deliveryTimeDays: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Coverage Area (Map Integration)</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <MapPin className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">Map picker will be integrated here</p>
                <p className="text-xs text-gray-400 mt-1">Draw polygon or select area</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddZone(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddZone}>
              Add Zone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
