import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { 
  Building2,
  Users,
  CreditCard,
  Settings,
  FileText,
  Phone,
  Mail
} from 'lucide-react'
import toast from 'react-hot-toast'

export function RestaurantOnboardingPage() {
  const [activeTab, setActiveTab] = useState('profile')
  
  // Profile state
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('restaurant')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [taxId, setTaxId] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Account Setup</h1>
        <p className="text-gray-600 mt-2">Complete your business profile and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="profile">
            <Building2 className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" />
            Team
          </TabsTrigger>
          <TabsTrigger value="branches">
            <FileText className="h-4 w-4 mr-2" />
            Branches
          </TabsTrigger>
          <TabsTrigger value="subscription">
            <CreditCard className="h-4 w-4 mr-2" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Settings className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Business Profile</CardTitle>
              <CardDescription>Update your business information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <Input id="businessName" placeholder="Enter business name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type *</Label>
                  <select 
                    id="businessType" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                  >
                    <option value="restaurant">Restaurant</option>
                    <option value="cafe">Café</option>
                    <option value="hotel">Hotel</option>
                    <option value="catering">Catering</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number</Label>
                  <Input id="registrationNumber" placeholder="Enter registration number" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxId">Tax ID</Label>
                  <Input id="taxId" placeholder="Enter tax ID" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vatNumber">VAT Number</Label>
                <Input id="vatNumber" placeholder="Enter VAT number" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
                <Textarea 
                  id="deliveryInstructions"
                  placeholder="e.g., Gate A, Floor 2, Landmark: next to gas station"
                  rows={3}
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                />
              </div>

              <Button onClick={() => toast.success('Profile updated!')}>
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>Manage your team contacts</CardDescription>
                </div>
                <Button>Add Member</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No team members added yet</p>
                <p className="text-sm text-gray-500 mt-2">Add contacts for owner, manager, purchasing, finance, and kitchen</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Branches Tab */}
        <TabsContent value="branches">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Branches</CardTitle>
                  <CardDescription>Manage your restaurant branches</CardDescription>
                </div>
                <Button>Add Branch</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No branches added yet</p>
                <p className="text-sm text-gray-500 mt-2">Add multiple locations for your restaurant</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle>Subscription & Billing</CardTitle>
              <CardDescription>Manage your plan and billing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Current Plan</h3>
                      <p className="text-sm text-gray-600">Free Tier</p>
                    </div>
                    <Badge variant="secondary">ACTIVE</Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Renewal Date</span>
                      <span className="font-medium">N/A</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Monthly Limit</span>
                      <span className="font-medium">Unlimited</span>
                    </div>
                  </div>

                  <Button className="mt-4 w-full">Upgrade Plan</Button>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <p className="text-sm text-blue-800">
                    💡 <strong>Upgrade</strong> to unlock advanced features like unlimited quick lists, priority support, and analytics
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4" />
                  <span>Email Notifications</span>
                </Label>
                <Label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4" />
                  <span>SMS Notifications</span>
                </Label>
                <Label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="h-4 w-4" />
                  <span>Push Notifications</span>
                </Label>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-semibold mb-4">Notification Types</h4>
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4" />
                    <span>Order Updates</span>
                  </Label>
                  <Label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4" />
                    <span>New Messages from Suppliers</span>
                  </Label>
                  <Label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="h-4 w-4" />
                    <span>Invoice Due Reminders</span>
                  </Label>
                  <Label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" />
                    <span>Low Stock Alerts</span>
                  </Label>
                </div>
              </div>

              <Button onClick={() => toast.success('Notification preferences saved!')}>
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

