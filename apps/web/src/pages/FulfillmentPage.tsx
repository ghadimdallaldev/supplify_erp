import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Package, MapPin, CheckCircle, AlertCircle, Truck, ClipboardList } from 'lucide-react'

export function FulfillmentPage() {
  const [activeTab, setActiveTab] = useState('waves')

  // Mock data
  const waves = [
    { id: '1', waveNumber: 'W-2024-001', scheduledDate: '2024-12-28', status: 'PICKING', orderCount: 12 },
    { id: '2', waveNumber: 'W-2024-002', scheduledDate: '2024-12-29', status: 'PENDING', orderCount: 8 },
  ]

  const pickLists = [
    { id: '1', orderNumber: 'ORD-123', status: 'IN_PROGRESS', assignedTo: 'John Picker', itemsCount: 15 },
    { id: '2', orderNumber: 'ORD-124', status: 'COMPLETED', assignedTo: 'Jane Picker', itemsCount: 8 },
  ]

  const routes = [
    { id: '1', routeNumber: 'R-2024-01', driver: 'Mike Driver', vehicle: 'Van-001', status: 'IN_PROGRESS', stops: 8 },
    { id: '2', routeNumber: 'R-2024-02', driver: 'Sarah Driver', vehicle: 'Van-002', status: 'PLANNED', stops: 5 },
  ]

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Fulfillment & Logistics</h1>
        <p className="text-gray-600 mt-2">Manage delivery waves, pick lists, and routes</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="waves">Waves</TabsTrigger>
          <TabsTrigger value="picklists">Pick Lists</TabsTrigger>
          <TabsTrigger value="routes">Routes</TabsTrigger>
          <TabsTrigger value="tracking">Delivery Tracking</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
        </TabsList>

        {/* Delivery Waves Tab */}
        <TabsContent value="waves" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Delivery Waves
                  </CardTitle>
                  <CardDescription>Batch orders for efficient picking</CardDescription>
                </div>
                <Button>Create New Wave</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {waves.map((wave) => (
                  <div key={wave.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{wave.waveNumber}</h4>
                          <Badge variant={wave.status === 'PICKING' ? 'default' : 'secondary'}>
                            {wave.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Scheduled: {wave.scheduledDate}</p>
                          <p>Orders: {wave.orderCount}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View</Button>
                        <Button variant="outline" size="sm">Edit</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pick Lists Tab */}
        <TabsContent value="picklists" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Pick Lists
                  </CardTitle>
                  <CardDescription>Mobile-friendly picking interface</CardDescription>
                </div>
                <Input placeholder="Search pick list..." className="w-64" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pickLists.map((list) => (
                  <div key={list.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{list.orderNumber}</h4>
                          <Badge variant={list.status === 'COMPLETED' ? 'default' : 'secondary'}>
                            {list.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Assigned to: {list.assignedTo}</p>
                          <p>Items: {list.itemsCount}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">View Mobile</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Routes Tab */}
        <TabsContent value="routes" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Delivery Routes
                  </CardTitle>
                  <CardDescription>Route planning and sequencing</CardDescription>
                </div>
                <Button>Plan New Route</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {routes.map((route) => (
                  <div key={route.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{route.routeNumber}</h4>
                          <Badge variant={route.status === 'IN_PROGRESS' ? 'default' : 'secondary'}>
                            {route.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Driver: {route.driver}</p>
                          <p>Vehicle: {route.vehicle} | Stops: {route.stops}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">View Map</Button>
                        <Button variant="outline" size="sm">Manifest</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Tracking Tab */}
        <TabsContent value="tracking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Delivery Tracking & POD
              </CardTitle>
              <CardDescription>Real-time delivery status and proof of delivery</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">ORD-123</h4>
                      <div className="text-sm text-gray-600 space-y-1 mt-1">
                        <p>Status: Out for Delivery</p>
                        <p>Driver: Mike Driver</p>
                        <p>ETA: 2:30 PM</p>
                      </div>
                    </div>
                    <Badge variant="default">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      In Transit
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exceptions Tab */}
        <TabsContent value="exceptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Delivery Exceptions & Returns
              </CardTitle>
              <CardDescription>Handle short/over deliveries and returns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">ORD-125 - Short Delivery</h4>
                      <div className="text-sm text-gray-600 space-y-1 mt-1">
                        <p>Type: Short Quantity</p>
                        <p>Product: Organic Tomatoes</p>
                        <p>Expected: 10kg, Actual: 8kg</p>
                      </div>
                    </div>
                    <Badge variant="destructive">Exception</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
