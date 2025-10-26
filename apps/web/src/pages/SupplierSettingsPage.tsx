import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Building2, Warehouse, MapPin, FileText, Clock, AlertCircle } from 'lucide-react'

export function SupplierSettingsPage() {
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
                <Button>Add Warehouse</Button>
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
                <Button>Add Zone</Button>
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
    </div>
  )
}
