'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Clock, Pause, Play, Eye, DollarSign, TrendingUp, Users, Package } from 'lucide-react';
import { usePromoSuiteGate } from '@/hooks/usePromoSuiteFlag';
import { useToast } from '@/hooks/use-toast';

interface Campaign {
  id: string;
  supplierId: string;
  supplierName: string;
  type: 'SPONSORED_VISIBILITY' | 'DISCOUNT' | 'FEATURED_PRODUCT';
  name: string;
  description?: string;
  placement?: string;
  status: 'DRAFT' | 'PENDING' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED' | 'EXHAUSTED';
  startDate: string;
  endDate: string;
  dailyBudgetUSD?: number;
  totalBudgetUSD?: number;
  spentUSD: number;
  cpmUSD?: number;
  cpcUSD?: number;
  targetType: string;
  targetIds: string[];
  keywords: string[];
  priorityScore: number;
  discountType?: string;
  discountValue?: number;
  minQty?: number;
  featureSlots?: number;
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
  discountCampaigns: number;
  featuredProducts: number;
}

const AdminPromoSuiteConsole: React.FC = () => {
  const { isEnabled, isLoading } = usePromoSuiteGate();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [kpis, setKpis] = useState<CampaignKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isEnabled) {
      fetchCampaigns();
      fetchKpis();
    }
  }, [isEnabled, statusFilter, searchQuery]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      
      // Fetch campaigns from API
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      const response = await fetch(`/api/admin/promotions/campaigns?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch campaigns');
      }
      
      const fetchedCampaigns = await response.json();
      setCampaigns(fetchedCampaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch campaigns',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchKpis = async () => {
    try {
      // Calculate KPIs from actual campaign data
      const active = campaigns.filter(c => c.status === 'ACTIVE').length;
      const totalBudgetUSD = campaigns.reduce((sum, c) => sum + (c.totalBudgetUSD || 0), 0);
      const totalSpentUSD = campaigns.reduce((sum, c) => sum + (c.spentUSD || 0), 0);
      const discountCampaigns = campaigns.filter(c => c.type === 'DISCOUNT').length;
      const featuredProducts = campaigns.filter(c => c.type === 'FEATURED_PRODUCT').length;
      
      const mockKpis: CampaignKpis = {
        active,
        totalBudgetUSD,
        totalSpentUSD,
        totalImpressions: 0, // Would be calculated from actual stats
        totalClicks: 0, // Would be calculated from actual stats
        ctr: 0, // Would be calculated from actual stats
        discountCampaigns,
        featuredProducts,
      };
      setKpis(mockKpis);
    } catch (error) {
      console.error('Error fetching KPIs:', error);
    }
  };

  const handleApproveCampaign = async (campaignId: string) => {
    try {
      // Call API to approve campaign
      const response = await fetch(`/api/admin/promotions/campaigns?id=${campaignId}&action=approve`, {
        method: 'PUT',
      });
      
      if (!response.ok) {
        throw new Error('Failed to approve campaign');
      }
      
      // Refresh campaigns list
      await fetchCampaigns();
      
      toast({
        title: 'Campaign Approved',
        description: 'The campaign has been approved and is now active',
      });
    } catch (error) {
      console.error('Error approving campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve campaign',
        variant: 'destructive',
      });
    }
  };

  const handleRejectCampaign = async (campaignId: string, reason: string) => {
    try {
      // Call API to reject campaign
      const response = await fetch(`/api/admin/promotions/campaigns?id=${campaignId}&action=reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to reject campaign');
      }
      
      // Refresh campaigns list
      await fetchCampaigns();
      
      toast({
        title: 'Campaign Rejected',
        description: `Campaign rejected: ${reason}`,
        variant: 'destructive',
      });
    } catch (error) {
      console.error('Error rejecting campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject campaign',
        variant: 'destructive',
      });
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      // Call API to pause campaign
      const response = await fetch(`/api/admin/promotions/campaigns?id=${campaignId}&action=pause`, {
        method: 'PUT',
      });
      
      if (!response.ok) {
        throw new Error('Failed to pause campaign');
      }
      
      // Refresh campaigns list
      await fetchCampaigns();
      
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
      // Call API to resume campaign
      const response = await fetch(`/api/admin/promotions/campaigns?id=${campaignId}&action=resume`, {
        method: 'PUT',
      });
      
      if (!response.ok) {
        throw new Error('Failed to resume campaign');
      }
      
      // Refresh campaigns list
      await fetchCampaigns();
      
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
        return <DollarSign className="h-4 w-4 text-gray-500" />;
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

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SPONSORED_VISIBILITY':
        return <TrendingUp className="h-4 w-4" />;
      case 'DISCOUNT':
        return <DollarSign className="h-4 w-4" />;
      case 'FEATURED_PRODUCT':
        return <Package className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    const matchesSearch = searchQuery === '' || 
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.supplierName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <Alert>
        <AlertDescription>
          PromoSuite is currently disabled. Enable the promotions_extended feature flag to access campaign management.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">PromoSuite Admin Console</h1>
          <p className="text-gray-600">Manage and review supplier campaigns</p>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpis.active}</div>
              <p className="text-xs text-muted-foreground">
                {kpis.discountCampaigns} discount, {kpis.featuredProducts} featured
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
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
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
                <SelectItem value="PENDING">Pending Review</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PAUSED">Paused</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXHAUSTED">Exhausted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>
            Review and manage supplier campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCampaigns.map((campaign) => (
                <div key={campaign.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getTypeIcon(campaign.type)}
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
                        {campaign.type.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Budget:</span>
                      <p className="font-medium">${campaign.totalBudgetUSD?.toLocaleString() || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Spent:</span>
                      <p className="font-medium">${campaign.spentUSD.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Duration:</span>
                      <p className="font-medium">
                        {new Date(campaign.startDate).toLocaleDateString()} - {new Date(campaign.endDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Created:</span>
                      <p className="font-medium">{new Date(campaign.createdAt).toLocaleDateString()}</p>
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
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {campaign.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApproveCampaign(campaign.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Reject Campaign</DialogTitle>
                                <DialogDescription>
                                  Provide a reason for rejecting this campaign.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <Input placeholder="Rejection reason..." />
                                <Button 
                                  onClick={() => handleRejectCampaign(campaign.id, 'Policy violation')}
                                  variant="destructive"
                                >
                                  Reject Campaign
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </>
                      )}
                      
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
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredCampaigns.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No campaigns found matching your criteria.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
                  <label className="text-sm font-medium text-gray-500">Supplier</label>
                  <p className="text-sm">{selectedCampaign.supplierName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Type</label>
                  <p className="text-sm">{selectedCampaign.type.replace('_', ' ')}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <Badge className={getStatusColor(selectedCampaign.status)}>
                    {selectedCampaign.status}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Priority Score</label>
                  <p className="text-sm">{selectedCampaign.priorityScore}</p>
                </div>
              </div>
              
              {selectedCampaign.description && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Description</label>
                  <p className="text-sm">{selectedCampaign.description}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Budget</label>
                  <p className="text-sm">${selectedCampaign.totalBudgetUSD?.toLocaleString() || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Spent</label>
                  <p className="text-sm">${selectedCampaign.spentUSD.toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Start Date</label>
                  <p className="text-sm">{new Date(selectedCampaign.startDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">End Date</label>
                  <p className="text-sm">{new Date(selectedCampaign.endDate).toLocaleDateString()}</p>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Target Items</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedCampaign.targetIds.map((id, index) => (
                    <Badge key={index} variant="secondary">{id}</Badge>
                  ))}
                </div>
              </div>
              
              {selectedCampaign.keywords.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Keywords</label>
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
    </div>
  );
};

export default AdminPromoSuiteConsole;
