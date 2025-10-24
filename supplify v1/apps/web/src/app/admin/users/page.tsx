'use client';

import { useAuthContext } from '@/app/auth-provider';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Layout } from '@/components/Layout';
import { SimpleNotificationManager } from '@/components/SimpleNotificationManager';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Search, 
  Filter, 
  MoreHorizontal,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Building2,
  Store,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: 'supplier' | 'restaurant' | 'admin';
  orgId: string;
  orgName: string;
  phone: string;
  businessType: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'suspended' | 'rejected';
  lastLogin?: string;
  tier?: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';
}

export default function UserManagementPage() {
  const { user: currentUser } = useAuthContext();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showUserDetails, setShowUserDetails] = useState(false);

  useEffect(() => {
    // Only load users if user is admin
    if (currentUser?.role === 'admin') {
      loadUsers();
    }
  }, [currentUser]);

  // Check if user is admin - moved after hooks
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Loading...</h1>
          <p className="text-gray-600">Please wait while we verify your access.</p>
        </div>
      </div>
    );
  }

  if (currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  const loadUsers = () => {
    setLoading(true);
    
    // Load users from localStorage (in real implementation, this would be an API call)
    const allUsers: User[] = [];
    
    // Load demo users
    const demoUsers: User[] = [
      {
        id: 'admin-1',
        email: 'admin@supplify.com',
        name: 'Admin User',
        firstName: 'Admin',
        lastName: 'User',
        role: 'admin',
        orgId: 'platform',
        orgName: 'Supplify Platform',
        phone: '+1-555-0001',
        businessType: 'Platform',
        address: {
          street: '123 Platform St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94105',
          country: 'United States',
        },
        createdAt: '2024-01-01T00:00:00Z',
        status: 'approved',
        lastLogin: '2024-01-15T10:30:00Z',
        tier: 'PREMIUM',
      },
      {
        id: 'restaurant-1',
        email: 'restaurant@supplify.com',
        name: 'Restaurant Manager',
        firstName: 'Restaurant',
        lastName: 'Manager',
        role: 'restaurant',
        orgId: 'restaurant-1',
        orgName: 'Golden Fork Restaurant',
        phone: '+1-555-0002',
        businessType: 'Restaurant',
        address: {
          street: '456 Restaurant Ave',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'United States',
        },
        createdAt: '2024-01-02T00:00:00Z',
        status: 'approved',
        lastLogin: '2024-01-14T15:20:00Z',
        tier: 'PRO',
      },
      {
        id: 'supplier-1',
        email: 'supplier@supplify.com',
        name: 'Sales Manager',
        firstName: 'Sales',
        lastName: 'Manager',
        role: 'supplier',
        orgId: 'supplier-1',
        orgName: 'Fresh Foods Supply',
        phone: '+1-555-0003',
        businessType: 'Food Distributor',
        address: {
          street: '789 Supply Blvd',
          city: 'Chicago',
          state: 'IL',
          zipCode: '60601',
          country: 'United States',
        },
        createdAt: '2024-01-03T00:00:00Z',
        status: 'approved',
        lastLogin: '2024-01-13T09:15:00Z',
        tier: 'PREMIUM',
      },
    ];

    // Load users from localStorage (new signups)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('supplify-user-')) {
        try {
          const userData = JSON.parse(localStorage.getItem(key) || '{}');
          if (userData.id && userData.role !== 'admin') {
            allUsers.push(userData);
          }
        } catch (error) {
          console.error('Error parsing user data:', error);
        }
      }
    }

    setUsers([...demoUsers, ...allUsers]);
    setLoading(false);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.orgName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesStatus && matchesRole;
  });

  const handleUserAction = async (userId: string, action: 'approve' | 'reject' | 'suspend') => {
    try {
      // Update user status (in real implementation, this would be an API call)
      setUsers(prev => prev.map(user => {
        if (user.id === userId) {
          let newStatus: User['status'];
          switch (action) {
            case 'approve':
              newStatus = 'approved';
              break;
            case 'reject':
              newStatus = 'rejected';
              break;
            case 'suspend':
              newStatus = 'suspended';
              break;
          }
          return { ...user, status: newStatus };
        }
        return user;
      }));

      // Update localStorage
      const userKey = `supplify-user-${userId}`;
      const userData = localStorage.getItem(userKey);
      if (userData) {
        const parsedUser = JSON.parse(userData);
        parsedUser.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'suspended';
        localStorage.setItem(userKey, JSON.stringify(parsedUser));
      }

      alert(`User ${action}d successfully!`);
    } catch (error) {
      alert(`Failed to ${action} user. Please try again.`);
    }
  };

  const getStatusBadge = (status: User['status']) => {
    const statusConfig = {
      pending_approval: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Approved' },
      suspended: { color: 'bg-red-100 text-red-800', icon: UserX, text: 'Suspended' },
      rejected: { color: 'bg-gray-100 text-gray-800', icon: XCircle, text: 'Rejected' },
    };
    
    const config = statusConfig[status];
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.text}
      </Badge>
    );
  };

  const getRoleIcon = (role: User['role']) => {
    switch (role) {
      case 'supplier':
        return <Store className="w-4 h-4 text-green-600" />;
      case 'restaurant':
        return <Building2 className="w-4 h-4 text-blue-600" />;
      case 'admin':
        return <UserCheck className="w-4 h-4 text-purple-600" />;
    }
  };

  const stats = {
    total: users.length,
    pending: users.filter(u => u.status === 'pending_approval').length,
    approved: users.filter(u => u.status === 'approved').length,
    suppliers: users.filter(u => u.role === 'supplier').length,
    restaurants: users.filter(u => u.role === 'restaurant').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Layout>
      <SimpleNotificationManager />
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
          <p className="text-gray-600">Manage user accounts, approvals, and access permissions</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Pending Approval</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <UserCheck className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Approved</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Store className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Suppliers</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.suppliers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Building2 className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Restaurants</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.restaurants}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search users by name, email, or organization..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="supplier">Suppliers</SelectItem>
                  <SelectItem value="restaurant">Restaurants</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <CardDescription>
              Manage user accounts and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery || statusFilter !== 'all' || roleFilter !== 'all'
                    ? 'Try adjusting your search or filter criteria.'
                    : 'No users have signed up yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Organization
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-sm font-medium text-gray-700">
                                  {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                                </span>
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{user.name}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{user.orgName}</div>
                          <div className="text-sm text-gray-500">{user.businessType}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getRoleIcon(user.role)}
                            <span className="text-sm text-gray-900 capitalize">{user.role}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(user.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setShowUserDetails(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            
                            {user.status === 'pending_approval' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleUserAction(user.id, 'approve')}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleUserAction(user.id, 'reject')}
                                  className="text-red-600 border-red-600 hover:bg-red-50"
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                            
                            {user.status === 'approved' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUserAction(user.id, 'suspend')}
                                className="text-orange-600 border-orange-600 hover:bg-orange-50"
                              >
                                <UserX className="w-4 h-4 mr-1" />
                                Suspend
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Details Modal */}
        <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>User Details</DialogTitle>
              <DialogDescription>
                Complete information about this user account
              </DialogDescription>
            </DialogHeader>
            
            {selectedUser && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Name</label>
                        <p className="text-sm text-gray-900">{selectedUser.name}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-sm text-gray-900 flex items-center gap-2">
                          <Mail className="w-4 h-4" />
                          {selectedUser.email}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Phone</label>
                        <p className="text-sm text-gray-900 flex items-center gap-2">
                          <Phone className="w-4 h-4" />
                          {selectedUser.phone}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Business Information</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Organization</label>
                        <p className="text-sm text-gray-900">{selectedUser.orgName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Business Type</label>
                        <p className="text-sm text-gray-900">{selectedUser.businessType}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Role</label>
                        <div className="flex items-center gap-2">
                          {getRoleIcon(selectedUser.role)}
                          <span className="text-sm text-gray-900 capitalize">{selectedUser.role}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Address</h3>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="text-sm text-gray-900">
                      <p>{selectedUser.address.street}</p>
                      <p>{selectedUser.address.city}, {selectedUser.address.state} {selectedUser.address.zipCode}</p>
                      <p>{selectedUser.address.country}</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Status</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Status</label>
                        <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Created</label>
                        <p className="text-sm text-gray-900">
                          {new Date(selectedUser.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {selectedUser.lastLogin && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Last Login</label>
                          <p className="text-sm text-gray-900">
                            {new Date(selectedUser.lastLogin).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
                    <div className="space-y-2">
                      {selectedUser.status === 'pending_approval' && (
                        <>
                          <Button
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              handleUserAction(selectedUser.id, 'approve');
                              setShowUserDetails(false);
                            }}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Approve User
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => {
                              handleUserAction(selectedUser.id, 'reject');
                              setShowUserDetails(false);
                            }}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject User
                          </Button>
                        </>
                      )}
                      
                      {selectedUser.status === 'approved' && (
                        <Button
                          variant="outline"
                          className="w-full text-orange-600 border-orange-600 hover:bg-orange-50"
                          onClick={() => {
                            handleUserAction(selectedUser.id, 'suspend');
                            setShowUserDetails(false);
                          }}
                        >
                          <UserX className="w-4 h-4 mr-2" />
                          Suspend User
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </Layout>
  );
}
