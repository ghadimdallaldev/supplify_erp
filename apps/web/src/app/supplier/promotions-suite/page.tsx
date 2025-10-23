'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PromoSuiteGate } from '../../../components/FeatureGates';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Plus, TrendingUp, DollarSign, Eye, MousePointer, AlertCircle } from 'lucide-react';
import { CreateCampaignModal } from './CreateCampaignModal';
import { CampaignDetailModal } from './CampaignDetailModal';

interface Campaign {
  id: string;
  type: 'SPONSORED_VISIBILITY' | 'DISCOUNT' | 'FEATURED_PRODUCT';
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  totalBudgetUSD?: number;
  spentUSD: number;
  cpmUSD?: number;
  discountType?: string;
  discountValue?: number;
  featureSlots?: number;
  approved: boolean;
}

interface CampaignKpis {
  active: number;
  totalBudgetUSD: number;
  totalSpentUSD: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
}

export default function PromoSuitePage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ['promosuite-campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/promosuite/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['promosuite-kpis'],
    queryFn: async () => {
      const response = await fetch('/api/promosuite/kpis');
      if (!response.ok) throw new Error('Failed to fetch KPIs');
      return response.json();
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

  if (campaignsLoading || kpisLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <PromoSuiteGate fallbackChildren={
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">PromoSuite Not Available</h2>
        <p className="text-gray-600">This feature is currently disabled. Contact your administrator to enable PromoSuite campaigns.</p>
      </div>
    }>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">PromoSuite</h1>
            <p className="text-gray-600 mt-2">Create and manage promotional campaigns</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Campaign
          </Button>
        </div>

        {/* KPI Cards */}
        {kpisLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Active Campaigns</p>
                    <p className="text-2xl font-bold text-gray-900">{kpis?.active || 0}</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Budget</p>
                    <p className="text-2xl font-bold text-gray-900">${kpis?.totalBudgetUSD?.toFixed(2) || '0.00'}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-green-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Impressions</p>
                    <p className="text-2xl font-bold text-gray-900">{kpis?.totalImpressions?.toLocaleString() || '0'}</p>
                  </div>
                  <Eye className="h-8 w-8 text-purple-600" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">CTR</p>
                    <p className="text-2xl font-bold text-gray-900">{kpis?.ctr?.toFixed(2) || '0.00'}%</p>
                  </div>
                  <MousePointer className="h-8 w-8 text-orange-600" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Campaigns Table */}
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
            <CardDescription>Manage your promotional campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            {campaignsLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
                <p className="text-gray-600 mb-4">Create your first promotional campaign to get started</p>
                <Button onClick={() => setShowCreateModal(true)}>
                  Create Campaign
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Campaign</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Type</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Budget</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Spent</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign: Campaign) => (
                      <tr key={campaign.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{campaign.name}</p>
                            <p className="text-sm text-gray-600">
                              {new Date(campaign.startDate).toLocaleDateString()} - {new Date(campaign.endDate).toLocaleDateString()}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">
                            {getCampaignTypeLabel(campaign.type)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={getStatusColor(campaign.status)}>
                            {campaign.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {campaign.totalBudgetUSD ? `$${campaign.totalBudgetUSD.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="py-3 px-4">
                          ${campaign.spentUSD.toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCampaign(campaign)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modals */}
        {showCreateModal && (
          <CreateCampaignModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              // Refetch campaigns
            }}
          />
        )}

        {selectedCampaign && (
          <CampaignDetailModal
            campaign={selectedCampaign}
            onClose={() => setSelectedCampaign(null)}
          />
        )}
      </div>
    </PromoSuiteGate>
  );
}
