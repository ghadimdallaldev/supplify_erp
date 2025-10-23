'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { 
  Settings, 
  Users, 
  Building2, 
  Globe, 
  ToggleLeft, 
  ToggleRight, 
  Plus, 
  Edit, 
  Trash2, 
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Percent,
  Search,
  Filter
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  type: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON';
  defaultValue: any;
  enabled: boolean;
  rolloutPercentage: number;
  targetingRules: TargetingRule[];
  dependencies: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastModifiedBy: string;
}

interface TargetingRule {
  id: string;
  type: 'GLOBAL' | 'ORGANIZATION' | 'USER' | 'PERCENTAGE';
  conditions: {
    organizations?: string[];
    users?: string[];
    userRoles?: string[];
    userTiers?: string[];
    percentage?: number;
    customProperties?: Record<string, any>;
  };
  value: any;
  enabled: boolean;
}

interface Organization {
  id: string;
  name: string;
  type: 'RESTAURANT' | 'SUPPLIER';
  tier: 'FREE' | 'PRO' | 'PREMIUM';
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  role: 'RESTAURANT' | 'SUPPLIER' | 'ADMIN';
  organizationId: string;
  organizationName: string;
  tier: 'FREE' | 'PRO' | 'PREMIUM';
  createdAt: string;
}

const FeatureFlagAdmin: React.FC = () => {
  const { toast } = useToast();
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Starting to fetch data...');
      
      // Fetch feature flags
      console.log('📡 Fetching flags...');
      const flagsResponse = await fetch('/api/admin/feature-flags?type=flags');
      console.log('📡 Flags response status:', flagsResponse.status);
      
      if (!flagsResponse.ok) {
        throw new Error(`Failed to fetch flags: ${flagsResponse.status} ${flagsResponse.statusText}`);
      }
      
      const fetchedFlags = await flagsResponse.json();
      console.log('✅ Fetched flags:', fetchedFlags);
      setFlags(fetchedFlags);
      
      // Fetch organizations
      console.log('📡 Fetching organizations...');
      const orgsResponse = await fetch('/api/admin/feature-flags?type=organizations');
      console.log('📡 Organizations response status:', orgsResponse.status);
      
      if (!orgsResponse.ok) {
        throw new Error(`Failed to fetch organizations: ${orgsResponse.status} ${orgsResponse.statusText}`);
      }
      
      const fetchedOrgs = await orgsResponse.json();
      console.log('✅ Fetched organizations:', fetchedOrgs);
      setOrganizations(fetchedOrgs);
      
      // Mock users for now
      const mockUsers: User[] = [
        {
          id: 'user_1',
          email: 'admin@supplify.com',
          role: 'ADMIN',
          organizationId: 'org_admin',
          organizationName: 'Supplify Admin',
          tier: 'PREMIUM',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'user_2',
          email: 'supplier@freshfoods.com',
          role: 'SUPPLIER',
          organizationId: 'sup_1',
          organizationName: 'Fresh Foods Co.',
          tier: 'PRO',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'user_3',
          email: 'restaurant@goldenfork.com',
          role: 'RESTAURANT',
          organizationId: 'rest_1',
          organizationName: 'Golden Fork Restaurant',
          tier: 'PRO',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];
      setUsers(mockUsers);
      
      console.log('🎉 Data fetch completed successfully!');
      
    } catch (error) {
      console.error('❌ Error fetching data:', error);
      toast({
        title: 'Error',
        description: `Failed to fetch feature flags data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFlag = async (flagId: string) => {
    try {
      console.log('🔄 Toggling flag:', flagId);
      
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_flag',
          data: { id: flagId },
        }),
      });

      console.log('📡 Toggle response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to toggle flag: ${response.status} ${errorText}`);
      }
      
      const updatedFlag = await response.json();
      console.log('✅ Updated flag:', updatedFlag);
      
      setFlags(prev => prev.map(flag => 
        flag.id === flagId ? updatedFlag : flag
      ));
      
      toast({
        title: 'Flag Updated',
        description: `Flag ${updatedFlag.enabledByDefault ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error) {
      console.error('❌ Error toggling flag:', error);
      toast({
        title: 'Error',
        description: `Failed to toggle feature flag: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateRollout = async (flagId: string, percentage: number) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_rollout',
          data: { id: flagId, rolloutPercentage: percentage },
        }),
      });

      if (!response.ok) throw new Error('Failed to update rollout');
      
      const updatedFlag = await response.json();
      setFlags(prev => prev.map(flag => 
        flag.id === flagId ? updatedFlag : flag
      ));
      
      toast({
        title: 'Rollout Updated',
        description: `Rollout percentage updated to ${percentage}%`,
      });
    } catch (error) {
      console.error('Error updating rollout:', error);
      toast({
        title: 'Error',
        description: 'Failed to update rollout percentage',
        variant: 'destructive',
      });
    }
  };

  const handleCreateFlag = async (flagData: Partial<FeatureFlag>) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_flag',
          data: flagData,
        }),
      });

      if (!response.ok) throw new Error('Failed to create flag');
      
      const newFlag = await response.json();
      setFlags(prev => [newFlag, ...prev]);
      setIsCreating(false);
      
      toast({
        title: 'Flag Created',
        description: 'Feature flag created successfully',
      });
    } catch (error) {
      console.error('Error creating flag:', error);
      toast({
        title: 'Error',
        description: 'Failed to create feature flag',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteFlag = async (flagId: string) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_flag',
          data: { id: flagId },
        }),
      });

      if (!response.ok) throw new Error('Failed to delete flag');
      
      setFlags(prev => prev.filter(flag => flag.id !== flagId));
      
      toast({
        title: 'Flag Deleted',
        description: 'Feature flag deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting flag:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete feature flag',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateFlag = async (updatedFlag: any) => {
    try {
      console.log('🔄 Updating flag:', updatedFlag);
      
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_flag',
          data: updatedFlag,
        }),
      });

      console.log('📡 Update response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update flag: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Updated flag result:', result);
      
      setFlags(prev => prev.map(flag => 
        flag.id === updatedFlag.id ? { ...flag, ...updatedFlag } : flag
      ));
      
      toast({
        title: 'Flag Updated',
        description: 'Feature flag updated successfully',
      });
    } catch (error) {
      console.error('❌ Error updating flag:', error);
      toast({
        title: 'Error',
        description: `Failed to update feature flag: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive',
      });
    }
  };

  // Filter flags based on search and tag filter
  const filteredFlags = flags.filter(flag => {
    // Always show flags if no search or filter is applied
    if (searchQuery === '' && tagFilter === 'all') {
      return true;
    }
    
    const matchesSearch = searchQuery === '' || 
      flag.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTag = tagFilter === 'all' || (flag.tags && flag.tags.includes(tagFilter));
    
    return matchesSearch && matchesTag;
  });

  // Debug logging
  console.log('🔍 Filter Debug:');
  console.log('  - Flags state:', flags);
  console.log('  - Filtered flags:', filteredFlags);
  console.log('  - Search query:', searchQuery);
  console.log('  - Tag filter:', tagFilter);
  console.log('  - Flags length:', flags.length);
  console.log('  - Filtered length:', filteredFlags.length);

  // Get unique tags for filter
  const allTags = Array.from(new Set(flags.flatMap(flag => flag.tags)));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feature Flags</h1>
            <p className="text-gray-600 mt-2">Manage system-wide feature toggles and rollouts</p>
          </div>
          <Button onClick={() => setIsCreating(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Flag
          </Button>
        </div>

        {/* Debug Info - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="mb-6 bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <h3 className="font-medium text-yellow-800 mb-2">Debug Info</h3>
              <div className="text-sm text-yellow-700 space-y-1">
                <p>✅ Total flags: {flags.length}</p>
                <p>🔍 Filtered flags: {filteredFlags.length}</p>
                <p>🏢 Organizations: {organizations.length}</p>
                <p>⏳ Loading: {loading ? 'Yes' : 'No'}</p>
                <p>🔍 Search: "{searchQuery}"</p>
                <p>🏷️ Tag filter: "{tagFilter}"</p>
                <p>📊 Available tags: {allTags.join(', ')}</p>
              </div>
              {flags.length > 0 && (
                <div className="mt-2 text-xs text-yellow-600">
                  <p>Flag keys: {flags.map((f: any) => f.key).join(', ')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search flags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tags</SelectItem>
                  {allTags.map(tag => (
                    <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="text-sm text-gray-600 flex items-center">
                Showing {filteredFlags.length} of {flags.length} flags
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Flags Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              organizations={organizations}
              onToggle={handleToggleFlag}
              onUpdateRollout={handleUpdateRollout}
              onDelete={handleDeleteFlag}
              onEdit={(flag) => setSelectedFlag(flag)}
            />
          ))}
        </div>

        {(filteredFlags.length === 0 && flags.length === 0) && (
          <Card>
            <CardContent className="text-center py-12">
              <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No flags found</h3>
              <p className="text-gray-600 mb-4">
                {flags.length === 0 
                  ? "No feature flags have been created yet." 
                  : "No flags match your current filters."}
              </p>
              {flags.length === 0 && (
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Flag
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Flag Dialog */}
        {isCreating && (
          <CreateFlagDialog
            organizations={organizations}
            users={users}
            onClose={() => setIsCreating(false)}
            onSave={handleCreateFlag}
          />
        )}

        {/* Edit Flag Dialog */}
        {selectedFlag && (
          <EditFlagDialog
            flag={selectedFlag}
            organizations={organizations}
            users={users}
            onClose={() => setSelectedFlag(null)}
            onToggle={handleToggleFlag}
            onSave={async (data) => {
              await handleUpdateFlag(data);
              setSelectedFlag(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

// Create Flag Dialog Component
function CreateFlagDialog({ organizations, users, onClose, onSave }: any) {
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    description: '',
    type: 'BOOLEAN',
    defaultValue: false,
    enabled: false,
    rolloutPercentage: 0,
    tags: '',
    dependencies: '',
  });

  const handleSubmit = () => {
    if (!formData.key || !formData.name) {
      alert('Please fill in required fields');
      return;
    }

    const flagData = {
      ...formData,
      tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
      dependencies: formData.dependencies.split(',').map(d => d.trim()).filter(Boolean),
      targetingRules: [],
    };

    onSave(flagData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Feature Flag</DialogTitle>
          <DialogDescription>
            Create a new feature flag to control system behavior
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="key">Flag Key *</Label>
              <Input
                id="key"
                value={formData.key}
                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                placeholder="e.g., newCheckoutFlow"
              />
            </div>
            <div>
              <Label htmlFor="name">Flag Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., New Checkout Flow"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this flag controls..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOLEAN">Boolean</SelectItem>
                  <SelectItem value="STRING">String</SelectItem>
                  <SelectItem value="NUMBER">Number</SelectItem>
                  <SelectItem value="JSON">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rollout">Rollout %</Label>
              <Input
                id="rollout"
                type="number"
                min="0"
                max="100"
                value={formData.rolloutPercentage}
                onChange={(e) => setFormData({ ...formData, rolloutPercentage: parseInt(e.target.value) })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="e.g., checkout, payment, ui"
              />
            </div>
            <div>
              <Label htmlFor="dependencies">Dependencies (comma-separated)</Label>
              <Input
                id="dependencies"
                value={formData.dependencies}
                onChange={(e) => setFormData({ ...formData, dependencies: e.target.value })}
                placeholder="e.g., userAuth, paymentGateway"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Switch
              checked={formData.enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
            />
            <Label>Enable flag by default</Label>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            Create Flag
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Edit Flag Dialog Component
function EditFlagDialog({ flag, organizations, users, onClose, onToggle, onSave }: any) {
  console.log('EditFlagDialog - flag:', flag);
  console.log('EditFlagDialog - onToggle:', typeof onToggle);
  
  const [formData, setFormData] = useState({
    name: flag.name,
    description: flag.description,
    enabledByDefault: flag.enabledByDefault,
    type: flag.type || 'BOOLEAN',
    rolloutPercentage: flag.rolloutPercentage || 0,
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave({
      ...flag,
      ...formData,
    });
  };
  
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Feature Flag</DialogTitle>
          <DialogDescription>
            Modify flag settings and targeting rules
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Flag Key</Label>
              <Input value={flag.key} disabled />
            </div>
            <div>
              <Label>Flag Name</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => handleInputChange('name', e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <Label>Description</Label>
            <Textarea 
              value={formData.description} 
              onChange={(e) => handleInputChange('description', e.target.value)}
            />
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Type</Label>
              <Select 
                value={formData.type}
                onValueChange={(value) => handleInputChange('type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOLEAN">Boolean</SelectItem>
                  <SelectItem value="STRING">String</SelectItem>
                  <SelectItem value="NUMBER">Number</SelectItem>
                  <SelectItem value="JSON">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rollout %</Label>
              <Input 
                type="number" 
                value={formData.rolloutPercentage} 
                onChange={(e) => handleInputChange('rolloutPercentage', parseInt(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                checked={formData.enabledByDefault} 
                onCheckedChange={(checked) => {
                  handleInputChange('enabledByDefault', checked);
                  onToggle(flag.id);
                }}
              />
              <Label>Enabled</Label>
            </div>
          </div>
          
          <div>
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {flag.tags.map((tag: string) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          </div>
          
          <div>
            <Label>Dependencies</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {flag.dependencies.map((dep: string) => (
                <Badge key={dep} variant="secondary">{dep}</Badge>
              ))}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Create Rule Modal Component
function CreateRuleModal({ flag, organizations, onClose, onSave }: any) {
  const [formData, setFormData] = useState({
    status: 'OFF',
    rolloutPct: 50,
    targetOrgType: '',
    targetOrgIds: [] as string[],
    priority: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Targeting Rule</DialogTitle>
          <DialogDescription>
            Create a rule for {flag.name} ({flag.key})
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Status</Label>
            <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OFF">OFF</SelectItem>
                <SelectItem value="ON">ON</SelectItem>
                <SelectItem value="ROLLOUT">ROLLOUT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.status === 'ROLLOUT' && (
            <div>
              <Label>Rollout Percentage</Label>
              <Slider
                value={[formData.rolloutPct]}
                onValueChange={([value]) => setFormData({...formData, rolloutPct: value})}
                max={100}
                step={5}
                className="w-full"
              />
              <div className="text-sm text-gray-600 mt-1">{formData.rolloutPct}%</div>
            </div>
          )}

          <div>
            <Label>Target Organization Type</Label>
            <Select value={formData.targetOrgType} onValueChange={(value) => setFormData({...formData, targetOrgType: value})}>
              <SelectTrigger>
                <SelectValue placeholder="Select org type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Organizations</SelectItem>
                <SelectItem value="SUPPLIER">Suppliers Only</SelectItem>
                <SelectItem value="RESTAURANT">Restaurants Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Priority</Label>
            <Input
              type="number"
              value={formData.priority}
              onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value) || 0})}
              placeholder="0"
            />
            <div className="text-xs text-gray-500 mt-1">Higher priority rules take precedence</div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Rule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Create Override Modal Component
function CreateOverrideModal({ flag, organizations, onClose, onSave }: any) {
  const [formData, setFormData] = useState({
    orgType: '',
    orgId: '',
    forcedStatus: 'FORCE_OFF',
    note: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const filteredOrgs = organizations.filter((org: any) => 
    !formData.orgType || org.type === formData.orgType
  );

  // Debug logging
  console.log('CreateOverrideModal - organizations:', organizations);
  console.log('CreateOverrideModal - formData.orgType:', formData.orgType);
  console.log('CreateOverrideModal - filteredOrgs:', filteredOrgs);

  // Add more detailed debugging
  if (organizations.length === 0) {
    console.warn('No organizations loaded! Check API call.');
  } else {
    console.log('✅ Organizations loaded:', organizations.length);
    console.log('📋 Organization types:', [...new Set(organizations.map((o: any) => o.type))]);
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Override</DialogTitle>
          <DialogDescription>
            Force a specific status for {flag.name} ({flag.key})
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Organization Type</Label>
            <Select value={formData.orgType} onValueChange={(value) => setFormData({...formData, orgType: value, orgId: ''})}>
              <SelectTrigger>
                <SelectValue placeholder="Select org type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUPPLIER">Supplier</SelectItem>
                <SelectItem value="RESTAURANT">Restaurant</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.orgType && (
            <div>
              <Label>Organization</Label>
              <Select value={formData.orgId} onValueChange={(value) => setFormData({...formData, orgId: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {filteredOrgs.length > 0 ? (
                    filteredOrgs.map((org: any) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.tier})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="" disabled>
                      {formData.orgType ? `No ${formData.orgType.toLowerCase()}s found` : 'Select organization type first'}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Forced Status</Label>
            <Select value={formData.forcedStatus} onValueChange={(value) => setFormData({...formData, forcedStatus: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FORCE_ON">Force ON</SelectItem>
                <SelectItem value="FORCE_OFF">Force OFF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Note (Optional)</Label>
            <Textarea
              value={formData.note}
              onChange={(e) => setFormData({...formData, note: e.target.value})}
              placeholder="Reason for this override..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Override
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Flag Card Component with Advanced Targeting
function FlagCard({ flag, organizations, onToggle, onUpdateRollout, onDelete, onEdit }: any) {
  const [showTargeting, setShowTargeting] = useState(false);
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
  const [showCreateOverrideModal, setShowCreateOverrideModal] = useState(false);

  const fetchFlagDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch rules
      const rulesResponse = await fetch(`/api/admin/feature-flags?type=rules&flagId=${flag.id}&environment=dev`);
      if (rulesResponse.ok) {
        const fetchedRules = await rulesResponse.json();
        setRules(fetchedRules);
      }
      
      // Fetch overrides
      const overridesResponse = await fetch(`/api/admin/feature-flags?type=overrides&flagId=${flag.id}&environment=dev`);
      if (overridesResponse.ok) {
        const fetchedOverrides = await overridesResponse.json();
        setOverrides(fetchedOverrides);
      }
    } catch (error) {
      console.error('Error fetching flag details:', error);
    } finally {
      setLoading(false);
    }
  };

  const createRule = async (ruleData: any) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_rule',
          data: {
            ...ruleData,
            flagId: flag.id,
            environment: 'dev',
            createdBy: 'admin_current',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to create rule');
      
      await fetchFlagDetails(); // Refresh data
      setShowCreateRuleModal(false);
    } catch (error) {
      console.error('Error creating rule:', error);
    }
  };

  const createOverride = async (overrideData: any) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_override',
          data: {
            ...overrideData,
            flagId: flag.id,
            environment: 'dev',
            createdBy: 'admin_current',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to create override');
      
      await fetchFlagDetails(); // Refresh data
      setShowCreateOverrideModal(false);
    } catch (error) {
      console.error('Error creating override:', error);
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_rule',
          data: { id: ruleId },
        }),
      });

      if (!response.ok) throw new Error('Failed to delete rule');
      
      await fetchFlagDetails(); // Refresh data
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const deleteOverride = async (overrideId: string) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_override',
          data: { id: overrideId },
        }),
      });

      if (!response.ok) throw new Error('Failed to delete override');
      
      await fetchFlagDetails(); // Refresh data
    } catch (error) {
      console.error('Error deleting override:', error);
    }
  };

  useEffect(() => {
    if (showTargeting) {
      fetchFlagDetails();
    }
  }, [showTargeting, flag.id]);

  // Get current effective status
  const getEffectiveStatus = () => {
    if (overrides.length > 0) {
      const override = overrides[0];
      return override.forcedStatus === 'FORCE_ON' ? 'ON' : 'OFF';
    }
    
    if (rules.length > 0) {
      const rule = rules[0];
      if (rule.status === 'ROLLOUT') {
        return `${rule.status} (${rule.rolloutPct}%)`;
      }
      return rule.status;
    }
    
    return flag.enabledByDefault ? 'ON' : 'OFF';
  };

  const effectiveStatus = getEffectiveStatus();

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-600" />
            <CardTitle className="text-lg">{flag.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={effectiveStatus === 'ON' ? 'default' : 'secondary'}>
              {effectiveStatus}
            </Badge>
          </div>
        </div>
        <CardDescription className="text-sm">
          <code className="bg-gray-100 px-2 py-1 rounded text-xs">{flag.key}</code>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">{flag.description}</p>
        
        {/* Dependencies */}
        {flag.dependencies.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs font-medium text-gray-500">Dependencies</Label>
            <div className="flex flex-wrap gap-1">
              {flag.dependencies.map(dep => (
                <Badge key={dep} variant="secondary" className="text-xs">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTargeting(!showTargeting)}
            className="flex-1"
          >
            <Target className="h-3 w-3 mr-1" />
            Targeting
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(flag)}
          >
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(flag.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Advanced Targeting Panel */}
        {showTargeting && (
          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Targeting Rules</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateRuleModal(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Rule
              </Button>
            </div>
            
            {loading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule: any) => (
                  <div key={rule.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{rule.status}</div>
                        {rule.status === 'ROLLOUT' && (
                          <div className="text-xs text-gray-600">{rule.rolloutPct}% rollout</div>
                        )}
                        {rule.targetOrgType && (
                          <div className="text-xs text-gray-600">Target: {rule.targetOrgType}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            // TODO: Implement edit rule functionality
                            console.log('Edit rule:', rule.id);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                <div className="flex items-center justify-between pt-4 border-t">
                  <h4 className="font-medium text-sm">Overrides</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateOverrideModal(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Override
                  </Button>
                </div>
                
                {overrides.map((override: any) => (
                  <div key={override.id} className="p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm text-blue-900">
                          Override: {override.forcedStatus}
                        </div>
                        {override.orgId && (
                          <div className="text-xs text-blue-700">
                            Org: {organizations.find((o: any) => o.id === override.orgId)?.name || override.orgId}
                          </div>
                        )}
                        {override.note && (
                          <div className="text-xs text-blue-600">{override.note}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            // TODO: Implement edit override functionality
                            console.log('Edit override:', override.id);
                            // For now, just show an alert
                            alert('Edit override functionality will be implemented with database integration');
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => deleteOverride(override.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {rules.length === 0 && overrides.length === 0 && (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No targeting rules configured
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        <div className="text-xs text-gray-500 pt-2 border-t">
          Updated {new Date(flag.updatedAt).toLocaleDateString()}
        </div>
      </CardContent>

      {/* Create Rule Modal */}
      {showCreateRuleModal && (
        <CreateRuleModal
          flag={flag}
          organizations={organizations}
          onClose={() => setShowCreateRuleModal(false)}
          onSave={createRule}
        />
      )}

      {/* Create Override Modal */}
      {showCreateOverrideModal && (
        <CreateOverrideModal
          flag={flag}
          organizations={organizations}
          onClose={() => setShowCreateOverrideModal(false)}
          onSave={createOverride}
        />
      )}
    </Card>
  );
}

export default FeatureFlagAdmin;