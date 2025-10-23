'use client';

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/app/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Building2, 
  Store, 
  Search, 
  Users, 
  Crown, 
  Shield,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  type: 'RESTAURANT' | 'SUPPLIER' | 'ADMIN';
  tier: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  memberCount: number;
  createdAt: string;
  lastActivity?: string;
}

interface TenantSwitcherProps {
  onTenantSwitch: (clientId: string) => void;
}

export function AdminTenantSwitcher({ onTenantSwitch }: TenantSwitcherProps) {
  const { user: currentUser } = useAuthContext();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [filteredOrgs, setFilteredOrgs] = useState<Organization[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Only show for admin users
  if (currentUser?.role !== 'admin') {
    return null;
  }

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    filterOrganizations();
  }, [organizations, searchQuery, typeFilter, tierFilter, statusFilter]);

  const loadOrganizations = async () => {
    setLoading(true);
    try {
      // In real implementation, this would be an API call
      const mockOrgs: Organization[] = [
        {
          id: 'org_restaurant_1',
          name: 'Golden Fork Restaurant',
          type: 'RESTAURANT',
          tier: 'PRO',
          status: 'ACTIVE',
          memberCount: 3,
          createdAt: '2024-01-01T00:00:00Z',
          lastActivity: '2024-01-15T10:30:00Z',
        },
        {
          id: 'org_supplier_1',
          name: 'Fresh Foods Supply',
          type: 'SUPPLIER',
          tier: 'PREMIUM',
          status: 'ACTIVE',
          memberCount: 5,
          createdAt: '2024-01-02T00:00:00Z',
          lastActivity: '2024-01-14T15:20:00Z',
        },
        {
          id: 'org_restaurant_2',
          name: 'Bella Vista Cafe',
          type: 'RESTAURANT',
          tier: 'BASIC',
          status: 'ACTIVE',
          memberCount: 2,
          createdAt: '2024-01-03T00:00:00Z',
          lastActivity: '2024-01-13T09:15:00Z',
        },
        {
          id: 'org_supplier_2',
          name: 'Metro Meat Co',
          type: 'SUPPLIER',
          tier: 'FREE',
          status: 'SUSPENDED',
          memberCount: 1,
          createdAt: '2024-01-04T00:00:00Z',
          lastActivity: '2024-01-10T14:45:00Z',
        },
        {
          id: 'org_restaurant_3',
          name: 'Downtown Diner',
          type: 'RESTAURANT',
          tier: 'FREE',
          status: 'INACTIVE',
          memberCount: 1,
          createdAt: '2024-01-05T00:00:00Z',
          lastActivity: '2024-01-08T16:30:00Z',
        },
      ];

      setOrganizations(mockOrgs);
    } catch (error) {
      console.error('Error loading organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOrganizations = () => {
    let filtered = organizations;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(org =>
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(org => org.type === typeFilter);
    }

    // Tier filter
    if (tierFilter !== 'all') {
      filtered = filtered.filter(org => org.tier === tierFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(org => org.status === statusFilter);
    }

    setFilteredOrgs(filtered);
  };

  const handleTenantSwitch = (clientId: string) => {
    onTenantSwitch(clientId);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'RESTAURANT':
        return <Building2 className="w-4 h-4 text-blue-600" />;
      case 'SUPPLIER':
        return <Store className="w-4 h-4 text-green-600" />;
      case 'ADMIN':
        return <Shield className="w-4 h-4 text-purple-600" />;
      default:
        return <Users className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'PREMIUM':
        return <Crown className="w-4 h-4 text-yellow-600" />;
      case 'PRO':
        return <Shield className="w-4 h-4 text-blue-600" />;
      case 'BASIC':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'FREE':
        return <Clock className="w-4 h-4 text-gray-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ACTIVE: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Active' },
      SUSPENDED: { color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle, text: 'Suspended' },
      INACTIVE: { color: 'bg-gray-100 text-gray-800', icon: XCircle, text: 'Inactive' },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig];
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.text}
      </Badge>
    );
  };

  const stats = {
    total: organizations.length,
    restaurants: organizations.filter(o => o.type === 'RESTAURANT').length,
    suppliers: organizations.filter(o => o.type === 'SUPPLIER').length,
    active: organizations.filter(o => o.status === 'ACTIVE').length,
    premium: organizations.filter(o => o.tier === 'PREMIUM').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-6 w-6 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Total Orgs</p>
                <p className="text-lg font-bold text-gray-900">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Building2 className="h-6 w-6 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Restaurants</p>
                <p className="text-lg font-bold text-gray-900">{stats.restaurants}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Store className="h-6 w-6 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Suppliers</p>
                <p className="text-lg font-bold text-gray-900">{stats.suppliers}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Active</p>
                <p className="text-lg font-bold text-gray-900">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center">
              <Crown className="h-6 w-6 text-yellow-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-600">Premium</p>
                <p className="text-lg font-bold text-gray-900">{stats.premium}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search organizations by name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RESTAURANT">Restaurants</SelectItem>
                <SelectItem value="SUPPLIER">Suppliers</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="FREE">Free</SelectItem>
                <SelectItem value="BASIC">Basic</SelectItem>
                <SelectItem value="PRO">Pro</SelectItem>
                <SelectItem value="PREMIUM">Premium</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Organizations List */}
      <Card>
        <CardHeader>
          <CardTitle>Organizations ({filteredOrgs.length})</CardTitle>
          <CardDescription>
            Select an organization to switch to its tenant context
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredOrgs.length === 0 ? (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No organizations found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchQuery || typeFilter !== 'all' || tierFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'No organizations have been created yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrgs.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        {getTypeIcon(org.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {org.name}
                        </p>
                        {getTierIcon(org.tier)}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-500">ID: {org.id}</p>
                        <span className="text-xs text-gray-300">•</span>
                        <p className="text-xs text-gray-500">{org.memberCount} members</p>
                        <span className="text-xs text-gray-300">•</span>
                        <p className="text-xs text-gray-500">
                          Created {new Date(org.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    {getStatusBadge(org.status)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedOrg(org);
                        setShowDetails(true);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Details
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleTenantSwitch(org.id)}
                      disabled={org.status !== 'ACTIVE'}
                    >
                      Switch To
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organization Details Modal */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Organization Details</DialogTitle>
            <DialogDescription>
              Complete information about this organization
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrg && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Name</label>
                      <p className="text-sm text-gray-900">{selectedOrg.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">ID</label>
                      <p className="text-sm text-gray-900 font-mono">{selectedOrg.id}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Type</label>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(selectedOrg.type)}
                        <span className="text-sm text-gray-900 capitalize">{selectedOrg.type.toLowerCase()}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Subscription & Status</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Tier</label>
                      <div className="flex items-center gap-2">
                        {getTierIcon(selectedOrg.tier)}
                        <span className="text-sm text-gray-900 capitalize">{selectedOrg.tier.toLowerCase()}</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Status</label>
                      <div className="mt-1">{getStatusBadge(selectedOrg.status)}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Members</label>
                      <p className="text-sm text-gray-900">{selectedOrg.memberCount} active members</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Created</label>
                    <p className="text-sm text-gray-900">
                      {new Date(selectedOrg.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedOrg.lastActivity && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Last Activity</label>
                      <p className="text-sm text-gray-900">
                        {new Date(selectedOrg.lastActivity).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowDetails(false)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    handleTenantSwitch(selectedOrg.id);
                    setShowDetails(false);
                  }}
                  disabled={selectedOrg.status !== 'ACTIVE'}
                >
                  Switch To This Organization
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
