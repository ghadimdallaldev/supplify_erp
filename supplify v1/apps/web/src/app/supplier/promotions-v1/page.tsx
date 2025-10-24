'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { 
  TrendingUp, 
  Target, 
  DollarSign, 
  Eye, 
  MousePointer, 
  BarChart3,
  Plus,
  Edit,
  Pause,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Building2,
  Package
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Campaign {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  description?: string;
  placement: 'SUPPLIER_CARD' | 'PRODUCT_LIST' | 'SEARCH_RESULT';
  objective: 'VISIBILITY' | 'TRAFFIC';
  status: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED' | 'EXHAUSTED';
  startDate: string;
  endDate: string;
  dailyBudgetUSD?: number;
  totalBudgetUSD: number;
  spentUSD: number;
  cpmUSD: number;
  cpcUSD?: number;
  targetType: 'PRODUCT' | 'CATEGORY' | 'SUPPLIER';
  targetIds: string[];
  keywords: string[];
  priorityScore: number;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignKpis {
  active: number;
  totalBudgetUSD: number;
  totalSpentUSD: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
}

interface AdStat {
  id: string;
  campaignId: string;
  day: string;
  impressions: number;
  clicks: number;
  spendUSD: number;
  createdAt: string;
}

const PromotionsV1Dashboard: React.FC = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [stats, setStats] = useState<AdStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, [statusFilter, searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Mock data - replace with actual GraphQL queries
      const mockCampaigns: Campaign[] = [
        {
          id: 'cmp_v1_1',
          supplierId: 'sup_1',
          supplierName: 'Fresh Foods Co.',
          name: 'Holiday Supplier Boost',
          description: 'Boost supplier card visibility during holiday season',
          placement: 'SUPPLIER_CARD',
          objective: 'VISIBILITY',
          status: 'PENDING',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          dailyBudgetUSD: 50,
          totalBudgetUSD: 1000,
          spentUSD: 450,
          cpmUSD: 2.5,
          cpcUSD: 0.5,
          targetType: 'SUPPLIER',
          targetIds: ['sup_1'],
          keywords: ['fresh', 'organic', 'local'],
          priorityScore: 1.2,
          approved: true,
          approvedBy: 'admin_1',
          approvedAt: '2024-01-01T00:00:00Z',
          createdBy: 'user_1',
          createdAt: '2023-12-15T00:00:00Z',
          updatedAt: '2024-01-15T00:00:00Z',
        },
        {
          id: 'cmp_v1_2',
          supplierId: 'sup_2',
          supplierName: 'Premium Meats Ltd.',
          name: 'Premium Cuts Promotion',
          description: 'Boost premium meat products in search results',
          placement: 'PRODUCT_LIST',
          objective: 'TRAFFIC',
          status: 'PENDING',
          startDate: '2024-01-15',
          endDate: '2024-02-15',
          dailyBudgetUSD: 30,
          totalBudgetUSD: 600,
          spentUSD: 180,
          cpmUSD: 3.0,
          cpcUSD: 0.75,
          targetType: 'PRODUCT',
          targetIds: ['prod_1', 'prod_2', 'prod_3'],
          keywords: ['meat', 'premium', 'cuts'],
          priorityScore: 1.0,
          approved: true,
          approvedBy: 'admin_1',
          approvedAt: '2024-01-15T00:00:00Z',
          createdBy: 'user_2',
          createdAt: '2024-01-10T00:00:00Z',
          updatedAt: '2024-01-20T00:00:00Z',
        },
        {
          id: 'cmp_v1_3',
          supplierId: 'sup_3',
          supplierName: 'Garden Fresh',
          name: 'Vegetable Search Boost',
          description: 'Boost vegetable products in search results',
          placement: 'SEARCH_RESULT',
          objective: 'VISIBILITY',
          status: 'PENDING',
          startDate: '2024-02-01',
          endDate: '2024-03-01',
          dailyBudgetUSD: 25,
          totalBudgetUSD: 500,
          spentUSD: 0,
          cpmUSD: 2.0,
          cpcUSD: 0.4,
          targetType: 'CATEGORY',
          targetIds: ['cat_vegetables'],
          keywords: ['vegetables', 'fresh', 'organic'],
          priorityScore: 0.9,
          approved: false,
          createdBy: 'user_3',
          createdAt: '2024-01-25T00:00:00Z',
          updatedAt: '2024-01-25T00:00:00Z',
        },
      ];

      const mockKpis: CampaignKpis = {
        active: 2,
        totalBudgetUSD: 2100,
        totalSpentUSD: 630,
        totalImpressions: 15000,
        totalClicks: 600,
        ctr: 4.0,
      };

      const mockStats: AdStat[] = [
        { id: 'stat_1', campaignId: 'cmp_v1_1', day: '2024-01-20', impressions: 1200, clicks: 48, spendUSD: 3.0, createdAt: '2024-01-20T00:00:00Z' },
        { id: 'stat_2', campaignId: 'cmp_v1_1', day: '2024-01-21', impressions: 1350, clicks: 54, spendUSD: 3.375, createdAt: '2024-01-21T00:00:00Z' },
        { id: 'stat_3', campaignId: 'cmp_v1_2', day: '2024-01-20', impressions: 800, clicks: 32, spendUSD: 2.4, createdAt: '2024-01-20T00:00:00Z' },
        { id: 'stat_4', campaignId: 'cmp_v1_2', day: '2024-01-21', impressions: 950, clicks: 38, spendUSD: 2.85, createdAt: '2024-01-21T00:00:00Z' },
      ];

      setCampaigns(mockCampaigns);
      setKpis(mockKpis);
      setStats(mockStats);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch campaigns data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (campaignData: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newCampaign: Campaign = {
        ...campaignData,
        id: `cmp_v1_${Date.now()}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      setCampaigns(prev => [newCampaign, ...prev]);
      setIsCreating(false);
      
      toast({
        title: 'Campaign Created',
        description: 'Your campaign has been created and is pending admin approval',
        variant: 'default',
      });
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to create campaign',
        variant: 'destructive',
      });
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      setCampaigns(prev => prev.map(campaign => 
        campaign.id === campaignId 
          ? { ...campaign, status: 'PAUSED', updatedAt: new Date().toISOString() }
          : campaign
      ));
      
      toast({
        title: 'Campaign Paused',
        description: 'The campaign has been paused',
      });
    } catch (error) {
      console.error('Error pausing campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to pause campaign',
        variant: 'destructive',
      });
    }
  };

  const handleResumeCampaign = async (campaignId: string) => {
    try {
      setCampaigns(prev => prev.map(campaign => 
        campaign.id === campaignId 
          ? { ...campaign, status: 'ACTIVE', updatedAt: new Date().toISOString() }
          : campaign
      ));
      
      toast({
        title: 'Campaign Resumed',
        description: 'The campaign has been resumed',
      });
    } catch (error) {
      console.error('Error resuming campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to resume campaign',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'PENDING':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'PAUSED':
        return <Pause className="h-4 w-4 text-orange-500" />;
      case 'REJECTED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'EXHAUSTED':
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PAUSED':
        return 'bg-orange-100 text-orange-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      case 'EXHAUSTED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPlacementIcon = (placement: string) => {
    switch (placement) {
      case 'SUPPLIER_CARD':
        return <Building2 className="h-4 w-4" />;
      case 'PRODUCT_LIST':
        return <Package className="h-4 w-4" />;
      case 'SEARCH_RESULT':
        return <Target className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    const matchesSearch = searchQuery === '' || 
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.supplierName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Promotions & Boosted Visibility</h1>
          <p className="text-gray-600">Create campaigns to boost supplier cards and products</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.active}</div>
              <p className="text-xs text-muted-foreground">
                {campaigns.filter(c => c.status === 'PENDING').length} pending review
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${kpis.totalBudgetUSD.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                ${kpis.totalSpentUSD.toLocaleString()} spent
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Impressions</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.totalImpressions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {kpis.totalClicks.toLocaleString()} clicks
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CTR</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.ctr.toFixed(2)}%</div>
              <p className="text-xs text-muted-foreground">
                Click-through rate
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXHAUSTED">Exhausted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns */}
      <div className="space-y-4">
        {filteredCampaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getPlacementIcon(campaign.placement)}
                    <div>
                      <h3 className="font-semibold">{campaign.name}</h3>
                      <p className="text-sm text-gray-600">{campaign.supplierName}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={getStatusColor(campaign.status)}>
                      {getStatusIcon(campaign.status)}
                      <span className="ml-1">{campaign.status}</span>
                    </Badge>
                    <Badge variant="outline">
                      {campaign.placement.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Budget:</span>
                    <p className="font-medium">${campaign.totalBudgetUSD.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Spent:</span>
                    <p className="font-medium">${campaign.spentUSD.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">CPM:</span>
                    <p className="font-medium">${campaign.cpmUSD}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Priority:</span>
                    <p className="font-medium">{campaign.priorityScore}</p>
                  </div>
                </div>

                {campaign.description && (
                  <p className="text-sm text-gray-600">{campaign.description}</p>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">Target:</span>
                    <Badge variant="secondary">{campaign.targetType}</Badge>
                    <span className="text-sm text-gray-500">{campaign.targetIds.length} items</span>
                    {campaign.keywords.length > 0 && (
                      <>
                        <span className="text-sm text-gray-500">Keywords:</span>
                        <div className="flex space-x-1">
                          {campaign.keywords.slice(0, 3).map((keyword, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                          {campaign.keywords.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{campaign.keywords.length - 3}
                            </Badge>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {campaign.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePauseCampaign(campaign.id)}
                      >
                        <Pause className="h-4 w-4 mr-1" />
                        Pause
                      </Button>
                    )}
                    
                    {campaign.status === 'PAUSED' && (
                      <Button
                        size="sm"
                        onClick={() => handleResumeCampaign(campaign.id)}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Resume
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedCampaign(campaign)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {filteredCampaigns.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-gray-500">
                No campaigns found matching your criteria.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Campaign Detail Modal */}
      {selectedCampaign && (
        <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedCampaign.name}</DialogTitle>
              <DialogDescription>
                Campaign details and performance metrics
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Supplier</Label>
                  <p className="text-sm">{selectedCampaign.supplierName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Placement</Label>
                  <p className="text-sm">{selectedCampaign.placement.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Objective</Label>
                  <p className="text-sm">{selectedCampaign.objective}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <Badge className={getStatusColor(selectedCampaign.status)}>
                    {selectedCampaign.status}
                  </Badge>
                </div>
              </div>
              
              {selectedCampaign.description && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Description</Label>
                  <p className="text-sm">{selectedCampaign.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Budget</Label>
                  <p className="text-sm">${selectedCampaign.totalBudgetUSD.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Spent</Label>
                  <p className="text-sm">${selectedCampaign.spentUSD.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">CPM</Label>
                  <p className="text-sm">${selectedCampaign.cpmUSD}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">CPC</Label>
                  <p className="text-sm">${selectedCampaign.cpcUSD || 'N/A'}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-500">Target Items</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedCampaign.targetIds.map((id, index) => (
                    <Badge key={index} variant="secondary">{id}</Badge>
                  ))}
                </div>
              </div>
              
              {selectedCampaign.keywords.length > 0 && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Keywords</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedCampaign.keywords.map((keyword, index) => (
                      <Badge key={index} variant="outline">{keyword}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Campaign Modal */}
      {isCreating && (
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
              <DialogDescription>
                Create a new promotion campaign to boost visibility
              </DialogDescription>
            </DialogHeader>
            <CreateCampaignForm 
              onSubmit={handleCreateCampaign}
              onClose={() => setIsCreating(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

// Create Campaign Form Component
const CreateCampaignForm: React.FC<{
  onSubmit: (campaign: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}> = ({ onSubmit, onClose }) => {
  const [formData, setFormData] = useState({
    supplierId: 'sup_1',
    supplierName: 'Fresh Foods Co.',
    name: '',
    description: '',
    placement: 'SUPPLIER_CARD' as 'SUPPLIER_CARD' | 'PRODUCT_LIST' | 'SEARCH_RESULT',
    objective: 'VISIBILITY' as 'VISIBILITY' | 'TRAFFIC',
    startDate: '',
    endDate: '',
    dailyBudgetUSD: 0,
    totalBudgetUSD: 0,
    cpmUSD: 2.5,
    cpcUSD: 0.5,
    targetType: 'PRODUCT' as 'PRODUCT' | 'CATEGORY' | 'SUPPLIER',
    targetIds: [] as string[],
    keywords: [] as string[],
    priorityScore: 1.0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const campaign: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'> = {
      ...formData,
      status: 'PENDING',
      spentUSD: 0,
      approved: false,
      createdBy: 'current_user',
    };
    
    onSubmit(campaign);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Campaign Name</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Holiday Boost"
            required
          />
        </div>
        <div>
          <Label>Supplier</Label>
          <Select value={formData.supplierId} onValueChange={(value) => setFormData({ ...formData, supplierId: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sup_1">Fresh Foods Co.</SelectItem>
              <SelectItem value="sup_2">Premium Meats Ltd.</SelectItem>
              <SelectItem value="sup_3">Garden Fresh</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe your campaign goals..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Placement</Label>
          <Select value={formData.placement} onValueChange={(value: any) => setFormData({ ...formData, placement: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SUPPLIER_CARD">Supplier Card</SelectItem>
              <SelectItem value="PRODUCT_LIST">Product List</SelectItem>
              <SelectItem value="SEARCH_RESULT">Search Result</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Objective</Label>
          <Select value={formData.objective} onValueChange={(value: any) => setFormData({ ...formData, objective: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="VISIBILITY">Visibility</SelectItem>
              <SelectItem value="TRAFFIC">Traffic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Start Date</Label>
          <Input
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>End Date</Label>
          <Input
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Daily Budget ($)</Label>
          <Input
            type="number"
            value={formData.dailyBudgetUSD}
            onChange={(e) => setFormData({ ...formData, dailyBudgetUSD: Number(e.target.value) })}
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <Label>Total Budget ($)</Label>
          <Input
            type="number"
            value={formData.totalBudgetUSD}
            onChange={(e) => setFormData({ ...formData, totalBudgetUSD: Number(e.target.value) })}
            min="0"
            step="0.01"
            required
          />
        </div>
        <div>
          <Label>CPM ($)</Label>
          <Input
            type="number"
            value={formData.cpmUSD}
            onChange={(e) => setFormData({ ...formData, cpmUSD: Number(e.target.value) })}
            min="0"
            step="0.01"
            required
          />
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Create Campaign</Button>
      </div>
    </form>
  );
};

export default PromotionsV1Dashboard;
