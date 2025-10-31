import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { 
  Building2,
  Users,
  CreditCard,
  Settings,
  FileText,
  Phone,
  Mail,
  Plus,
  Trash2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { SubscriptionInfo } from '../components/SubscriptionInfo'
import { LogoUpload } from '../components/LogoUpload'
import { useGetRestaurantMeQuery, useUploadRestaurantLogoMutation, useGetPresignedUrlMutation } from '../services/api'

export function RestaurantOnboardingPage() {
  const { data: restaurantData, isLoading: isLoadingRestaurant } = useGetRestaurantMeQuery()
  const [uploadRestaurantLogo] = useUploadRestaurantLogoMutation()
  const [getPresignedUrl] = useGetPresignedUrlMutation()
  
  const [activeTab, setActiveTab] = useState('profile')
  
  const restaurant = restaurantData?.restaurant
  
  const handleLogoUpload = async (logoUrl: string) => {
    if (!restaurant?.id) {
      toast.error('Restaurant information not loaded')
      return
    }
    await uploadRestaurantLogo({ id: restaurant.id, logoUrl }).unwrap()
  }
  
  const handleGetPresignedUrl = async (params: { fileName: string; fileType: string; fileSize?: number }) => {
    const result = await getPresignedUrl(params).unwrap()
    return result
  }
  
  // Profile state
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('restaurant')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [taxId, setTaxId] = useState('')
  const [vatNumber, setVatNumber] = useState('')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  
  // Team state
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false)
  const [showAddBranchDialog, setShowAddBranchDialog] = useState(false)
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [branches, setBranches] = useState<any[]>([])
  const [newMember, setNewMember] = useState({ name: '', email: '', phone: '', role: 'manager', isPrimary: false })
  const [newBranch, setNewBranch] = useState({ name: '', phone: '', address: '', deliveryInstructions: '' })
  
  // Notification state
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    push: true,
    orderUpdates: true,
    newMessages: true,
    invoiceReminders: true,
    lowStock: false
  })

  const handleAddMember = () => {
    if (!newMember.name || !newMember.email) {
      toast.error('Please fill in name and email')
      return
    }
    
    setTeamMembers([...teamMembers, { ...newMember, id: Date.now() }])
    setNewMember({ name: '', email: '', phone: '', role: 'manager', isPrimary: false })
    setShowAddMemberDialog(false)
    toast.success('Team member added!')
  }

  const handleAddBranch = () => {
    if (!newBranch.name) {
      toast.error('Please fill in branch name')
      return
    }
    
    setBranches([...branches, { ...newBranch, id: Date.now() }])
    setNewBranch({ name: '', phone: '', address: '', deliveryInstructions: '' })
    setShowAddBranchDialog(false)
    toast.success('Branch added!')
  }

  const handleSaveNotifications = () => {
    toast.success('Notification preferences saved!')
  }

  const handleToggleNotification = (key: string) => {
    setNotifications({ ...notifications, [key]: !notifications[key as keyof typeof notifications] })
  }

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
              <CardTitle>Business Logo</CardTitle>
              <CardDescription>Upload your business logo. This will be displayed in your profile and to suppliers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingRestaurant ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : restaurant ? (
                <LogoUpload
                  currentLogo={restaurant.logo_url}
                  onUpload={handleLogoUpload}
                  entityId={restaurant.id}
                  entityName={restaurant.name || 'Restaurant'}
                  getPresignedUrl={handleGetPresignedUrl}
                />
              ) : (
                <p className="text-sm text-gray-500">Loading restaurant information...</p>
              )}
            </CardContent>
          </Card>
          
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
                <Button onClick={() => setShowAddMemberDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {teamMembers.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No team members added yet</p>
                  <p className="text-sm text-gray-500 mt-2">Add contacts for owner, manager, purchasing, finance, and kitchen</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between border rounded-lg p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{member.name}</p>
                          {member.isPrimary && <Badge variant="default">Primary</Badge>}
                          <Badge variant="outline" className="capitalize">{member.role}</Badge>
                        </div>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        {member.phone && <p className="text-sm text-gray-600">{member.phone}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setTeamMembers(teamMembers.filter(m => m.id !== member.id))
                        toast.success('Member removed')
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
                <Button onClick={() => setShowAddBranchDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Branch
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {branches.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No branches added yet</p>
                  <p className="text-sm text-gray-500 mt-2">Add multiple locations for your restaurant</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="flex items-center justify-between border rounded-lg p-4">
                      <div className="flex-1">
                        <p className="font-medium">{branch.name}</p>
                        {branch.phone && <p className="text-sm text-gray-600">{branch.phone}</p>}
                        {branch.address && <p className="text-sm text-gray-600">{branch.address}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setBranches(branches.filter(b => b.id !== branch.id))
                        toast.success('Branch removed')
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <SubscriptionInfo />
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
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifications.email}
                    onChange={() => handleToggleNotification('email')}
                    className="h-4 w-4" 
                  />
                  <span>Email Notifications</span>
                </Label>
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifications.sms}
                    onChange={() => handleToggleNotification('sms')}
                    className="h-4 w-4" 
                  />
                  <span>SMS Notifications</span>
                </Label>
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={notifications.push}
                    onChange={() => handleToggleNotification('push')}
                    className="h-4 w-4" 
                  />
                  <span>Push Notifications</span>
                </Label>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-semibold mb-4">Notification Types</h4>
                <div className="space-y-3">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={notifications.orderUpdates}
                      onChange={() => handleToggleNotification('orderUpdates')}
                      className="h-4 w-4" 
                    />
                    <span>Order Updates</span>
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={notifications.newMessages}
                      onChange={() => handleToggleNotification('newMessages')}
                      className="h-4 w-4" 
                    />
                    <span>New Messages from Suppliers</span>
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={notifications.invoiceReminders}
                      onChange={() => handleToggleNotification('invoiceReminders')}
                      className="h-4 w-4" 
                    />
                    <span>Invoice Due Reminders</span>
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={notifications.lowStock}
                      onChange={() => handleToggleNotification('lowStock')}
                      className="h-4 w-4" 
                    />
                    <span>Low Stock Alerts</span>
                  </Label>
                </div>
              </div>

              <Button onClick={handleSaveNotifications}>
                Save Preferences
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Team Member Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a contact to your restaurant team
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="memberName">Name *</Label>
              <Input
                id="memberName"
                placeholder="Enter name"
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberEmail">Email *</Label>
              <Input
                id="memberEmail"
                type="email"
                placeholder="Enter email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberPhone">Phone</Label>
              <Input
                id="memberPhone"
                placeholder="Enter phone"
                value={newMember.phone}
                onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberRole">Role</Label>
              <select
                id="memberRole"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
              >
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
                <option value="purchasing">Purchasing</option>
                <option value="finance">Finance</option>
                <option value="kitchen">Kitchen</option>
              </select>
            </div>

            <Label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newMember.isPrimary}
                onChange={(e) => setNewMember({ ...newMember, isPrimary: e.target.checked })}
                className="h-4 w-4"
              />
              <span>Set as primary contact</span>
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMember}>
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Branch Dialog */}
      <Dialog open={showAddBranchDialog} onOpenChange={setShowAddBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Branch</DialogTitle>
            <DialogDescription>
              Add a new branch location
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branchName">Branch Name *</Label>
              <Input
                id="branchName"
                placeholder="e.g., Downtown Branch"
                value={newBranch.name}
                onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchPhone">Phone</Label>
              <Input
                id="branchPhone"
                placeholder="Enter phone"
                value={newBranch.phone}
                onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchAddress">Address</Label>
              <Input
                id="branchAddress"
                placeholder="Enter address"
                value={newBranch.address}
                onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchDeliveryInstructions">Delivery Instructions</Label>
              <Textarea
                id="branchDeliveryInstructions"
                placeholder="Special instructions for deliveries..."
                rows={3}
                value={newBranch.deliveryInstructions}
                onChange={(e) => setNewBranch({ ...newBranch, deliveryInstructions: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBranchDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBranch}>
              Add Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

