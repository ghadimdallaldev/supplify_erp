'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { X, Play, Pause, Edit, Trash2, TrendingUp, Eye, MousePointer, DollarSign } from 'lucide-react';
// import { toast } from 'sonner';

interface Campaign {
  id: string;
  type: 'SPONSORED_VISIBILITY' | 'DISCOUNT' | 'FEATURED_PRODUCT';
  name: string;
  description?: string;
  status: string;
  startDate: string;
  endDate: string;
  totalBudgetUSD?: number;
  spentUSD: number;
  cpmUSD?: number;
  cpcUSD?: number;
  discountType?: string;
  discountValue?: number;
  minQty?: number;
  featureSlots?: number;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CampaignDetailModalProps {
  campaign: Campaign;
  onClose: () => void;
}

export function CampaignDetailModal({ campaign, onClose }: CampaignDetailModalProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/promosuite/campaigns/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error('Failed to update campaign status');
      return response.json();
    },
    onSuccess: () => {
      alert('Campaign status updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['promosuite-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['promosuite-kpis'] });
    },
    onError: (error) => {
      alert(error.message || 'Failed to update campaign status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/promosuite/campaigns/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete campaign');
      return response.json();
    },
    onSuccess: () => {
      alert('Campaign deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['promosuite-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['promosuite-kpis'] });
      onClose();
    },
    onError: (error) => {
      alert(error.message || 'Failed to delete campaign');
    },
  });

  const getCampaignTypeLabel = (type: string) => {
    switch (type) {
      case 'SPONSORED_VISIBILITY':
        return 'Sponsored Visibility';
      case 'DISCOUNT':
        return 'Discount Campaign';
      case 'FEATURED_PRODUCT':
        return 'Featured Product';
      default:
        return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PAUSED':
        return 'bg-gray-100 text-gray-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusChange = (newStatus: string) => {
    updateStatusMutation.mutate({ id: campaign.id, status: newStatus });
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      deleteMutation.mutate(campaign.id);
    }
  };

  const canEdit = campaign.status !== 'ACTIVE';
  const canPause = campaign.status === 'ACTIVE';
  const canResume = campaign.status === 'PAUSED';
  const canDelete = campaign.status !== 'ACTIVE';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">{getCampaignTypeLabel(campaign.type)}</Badge>
                <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                {campaign.approved && <Badge variant="default">Approved</Badge>}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Campaign Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {campaign.description && (
                    <div>
                      <h4 className="font-medium text-gray-900">Description</h4>
                      <p className="text-gray-600">{campaign.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900">Start Date</h4>
                      <p className="text-gray-600">{new Date(campaign.startDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">End Date</h4>
                      <p className="text-gray-600">{new Date(campaign.endDate).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900">Created</h4>
                      <p className="text-gray-600">{new Date(campaign.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">Last Updated</h4>
                      <p className="text-gray-600">{new Date(campaign.updatedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Type-specific Information */}
              {campaign.type === 'SPONSORED_VISIBILITY' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Sponsored Visibility Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-gray-900">Total Budget</h4>
                        <p className="text-gray-600">${campaign.totalBudgetUSD?.toFixed(2) || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">Spent</h4>
                        <p className="text-gray-600">${campaign.spentUSD.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-gray-900">CPM</h4>
                        <p className="text-gray-600">${campaign.cpmUSD?.toFixed(4) || 'N/A'}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">CPC</h4>
                        <p className="text-gray-600">${campaign.cpcUSD?.toFixed(4) || 'N/A'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {campaign.type === 'DISCOUNT' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Discount Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-gray-900">Discount Type</h4>
                        <p className="text-gray-600">{campaign.discountType}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">Discount Value</h4>
                        <p className="text-gray-600">
                          {campaign.discountType === 'PERCENT' 
                            ? `${campaign.discountValue}%` 
                            : `$${campaign.discountValue?.toFixed(2)}`
                          }
                        </p>
                      </div>
                    </div>
                    {campaign.minQty && (
                      <div>
                        <h4 className="font-medium text-gray-900">Minimum Quantity</h4>
                        <p className="text-gray-600">{campaign.minQty}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {campaign.type === 'FEATURED_PRODUCT' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Featured Product Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900">Feature Slots</h4>
                      <p className="text-gray-600">{campaign.featureSlots}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Actions and Stats */}
            <div className="space-y-6">
              {/* Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canEdit && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Campaign
                    </Button>
                  )}

                  {canPause && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => handleStatusChange('PAUSED')}
                      disabled={updateStatusMutation.isPending}
                    >
                      <Pause className="h-4 w-4 mr-2" />
                      Pause Campaign
                    </Button>
                  )}

                  {canResume && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => handleStatusChange('ACTIVE')}
                      disabled={updateStatusMutation.isPending}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Resume Campaign
                    </Button>
                  )}

                  {canDelete && (
                    <Button 
                      variant="destructive" 
                      className="w-full justify-start"
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Campaign
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Impressions</span>
                    </div>
                    <span className="font-medium">0</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MousePointer className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">Clicks</span>
                    </div>
                    <span className="font-medium">0</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">CTR</span>
                    </div>
                    <span className="font-medium">0.00%</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
