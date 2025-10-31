import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Building2, Warehouse, MapPin, FileText, Clock, AlertCircle, UserPlus, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import Papa from 'papaparse'
import { LogoUpload } from '../components/LogoUpload'
import { useGetSupplierMeQuery, useUploadSupplierLogoMutation, useGetPresignedUrlMutation } from '../services/api'

export function SupplierSettingsPage() {
  const { data: supplierData, isLoading: isLoadingSupplier } = useGetSupplierMeQuery()
  const [uploadSupplierLogo] = useUploadSupplierLogoMutation()
  const [getPresignedUrl] = useGetPresignedUrlMutation()
  
  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const [showAddZone, setShowAddZone] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [uploadedContacts, setUploadedContacts] = useState<any[]>([])
  
  const supplier = supplierData?.supplier
  
  const handleLogoUpload = async (logoUrl: string) => {
    if (!supplier?.id) {
      toast.error('Supplier information not loaded')
      return
    }
    await uploadSupplierLogo({ id: supplier.id, logoUrl }).unwrap()
  }
  
  const handleGetPresignedUrl = async (params: { fileName: string; fileType: string; fileSize?: number }) => {
    const result = await getPresignedUrl(params).unwrap()
    return result
  }
  
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

  // Contact form state
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    isPrimary: false,
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

  const handleAddContact = () => {
    // TODO: Implement API call to add contact
    console.log('Adding contact:', contactForm)
    toast.success('Contact added successfully!')
    setShowAddContact(false)
    setContactForm({
      name: '',
      email: '',
      phone: '',
      role: '',
      isPrimary: false,
    })
  }

  const handleFileUpload = (event: any) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a CSV or Excel file')
      return
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const contacts = results.data.map((row: any, index) => ({
            id: index + 1,
            name: row.Name || row.name || '',
            email: row.Email || row.email || '',
            phone: row.Phone || row.phone || '',
            role: row.Role || row.role || row.Title || row.title || '',
            isPrimary: row['Is Primary'] === 'true' || row['is_primary'] === 'true' || false,
          })).filter(contact => contact.name && contact.email)

          if (contacts.length === 0) {
            toast.error('No valid contacts found in the file')
            return
          }

          setUploadedContacts(contacts)
          toast.success(`Imported ${contacts.length} contacts`)
        } catch (error) {
          toast.error('Error parsing file')
          console.error(error)
        }
      },
      error: (error) => {
        toast.error('Error reading file')
        console.error(error)
      }
    })
  }

  const handleSaveBulkContacts = () => {
    if (uploadedContacts.length === 0) {
      toast.error('No contacts to save')
      return
    }

    // TODO: Implement API call to save bulk contacts
    console.log('Saving contacts:', uploadedContacts)
    toast.success(`${uploadedContacts.length} contacts uploaded successfully!`)
    setShowBulkUpload(false)
    setUploadedContacts([])
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
                Company Logo
              </CardTitle>
              <CardDescription>Upload your company logo. This will be displayed in your profile and to restaurants.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSupplier ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : supplier ? (
                <LogoUpload
                  currentLogo={supplier.logo_url}
                  onUpload={handleLogoUpload}
                  entityId={supplier.id}
                  entityName={supplier.name || 'Supplier'}
                  getPresignedUrl={handleGetPresignedUrl}
                />
              ) : (
                <p className="text-sm text-gray-500">Loading supplier information...</p>
              )}
            </CardContent>
          </Card>
          
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

        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Business Contacts
                  </CardTitle>
                  <CardDescription>Manage business contact information</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowBulkUpload(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload CSV/Excel
                  </Button>
                  <Button onClick={() => setShowAddContact(true)}>Add Contact</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">John Doe</h4>
                        <Badge variant="secondary">Sales Manager</Badge>
                        <Badge>Primary</Badge>
                      </div>
                      <p className="text-sm text-gray-600">john.doe@freshproduce.com</p>
                      <p className="text-sm text-gray-600">+1 (555) 123-4567</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Edit</Button>
                      <Button variant="outline" size="sm">Remove</Button>
                    </div>
                  </div>
                </div>
                
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">Jane Smith</h4>
                        <Badge variant="secondary">Operations Lead</Badge>
                      </div>
                      <p className="text-sm text-gray-600">jane.smith@freshproduce.com</p>
                      <p className="text-sm text-gray-600">+1 (555) 987-6543</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">Edit</Button>
                      <Button variant="outline" size="sm">Remove</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Business Hours & Policies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <h3 className="font-medium">Operating Hours</h3>
                <div className="space-y-2">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                    <div key={day} className="flex items-center gap-4">
                      <div className="w-24">{day}</div>
                      <Input type="time" placeholder="09:00" />
                      <span className="text-gray-500">to</span>
                      <Input type="time" placeholder="17:00" />
                      <Button variant="outline" size="sm">Closed</Button>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="space-y-4 pt-6">
                <h3 className="font-medium">Policies</h3>
                <div className="space-y-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Minimum Order Value</label>
                    <Input type="number" placeholder="100" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Payment Terms</label>
                    <Input placeholder="Net 30" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Return Policy</label>
                    <Input placeholder="7 days return window" />
                  </div>
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

      {/* Add Contact Dialog */}
      <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Contact</DialogTitle>
            <DialogDescription>
              Add a business contact person
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                placeholder="John Doe"
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email *</label>
                <Input
                  type="email"
                  placeholder="john.doe@example.com"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone *</label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role/Title</label>
              <Input
                placeholder="Sales Manager"
                value={contactForm.role}
                onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isPrimary"
                checked={contactForm.isPrimary}
                onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="isPrimary" className="text-sm font-medium">
                Set as primary contact
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContact(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddContact}>
              Add Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Upload Feature */}
      <Dialog open={showBulkUpload} onOpenChange={setShowBulkUpload}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload Contacts from CSV/Excel</DialogTitle>
            <DialogDescription>
              Upload a spreadsheet file to bulk add contacts
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 cursor-pointer">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="h-12 w-12 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">Drop your CSV/Excel file here</p>
                <p className="text-xs text-gray-400 mt-1">or click to browse</p>
              </label>
            </div>
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-1">Expected columns:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Name (required)</li>
                <li>Email (required)</li>
                <li>Phone</li>
                <li>Role or Title</li>
                <li>Is Primary (true/false, optional)</li>
              </ul>
            </div>

            {uploadedContacts.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-sm">Preview ({uploadedContacts.length} contacts):</p>
                <div className="max-h-48 overflow-y-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">Phone</th>
                        <th className="px-3 py-2 text-left">Role</th>
                        <th className="px-3 py-2 text-center">Primary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedContacts.map((contact) => (
                        <tr key={contact.id} className="border-t">
                          <td className="px-3 py-2">{contact.name}</td>
                          <td className="px-3 py-2">{contact.email}</td>
                          <td className="px-3 py-2">{contact.phone}</td>
                          <td className="px-3 py-2">{contact.role}</td>
                          <td className="px-3 py-2 text-center">
                            {contact.isPrimary ? (
                              <Badge variant="secondary">Yes</Badge>
                            ) : (
                              <Badge variant="outline">No</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowBulkUpload(false)
              setUploadedContacts([])
            }}>
              Cancel
            </Button>
            <Button onClick={handleSaveBulkContacts} disabled={uploadedContacts.length === 0}>
              Upload {uploadedContacts.length > 0 ? `(${uploadedContacts.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
