'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp, Eye, MousePointer, DollarSign, Pause, Play, BarChart3 } from 'lucide-react';
import { useFeature } from '@/hooks/useEntitlements';
import { UpgradeBanner } from '@/components/UpgradeBanner';

/**
 * Supplier Campaigns Dashboard
 * Manage sponsored visibility campaigns
 */
export default function CampaignsDashboard() {
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const { enabled: hasPromotions, requiredTier } = useFeature('promotions', 'SUPPLIER');

  const queryClient = useQueryClient();

  // Fetch campaigns
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetMyCampaigns {
              myPromotions {
                id
                name
                status
                startDate
                endDate
                dailyBudgetUSD
                totalBudgetUSD
                spentUSD
                impressions
                clicks
                ctr
                orders
                revenue
              }
            }
          `,
        }),
      });

      const result = await response.json();
      return result.data?.myPromotions || [];
    },
    enabled: hasPromotions,
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation { pausePromotion(id: "${id}") { id status } }`,
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  if (!hasPromotions) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Sponsored Campaigns</h1>
          <UpgradeBanner
            feature="sponsored campaigns"
            requiredTier={requiredTier!}
            variant="banner"
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>;
  }

  const activeCampaigns = campaigns?.filter((c: any) => c.status === 'ACTIVE') || [];
  const totalSpent = campaigns?.reduce((sum: number, c: any) => sum + parseFloat(c.spentUSD), 0) || 0;
  const totalImpressions = campaigns?.reduce((sum: number, c: any) => sum + c.impressions, 0) || 0;
  const avgCTR = campaigns?.length > 0
    ? campaigns.reduce((sum: number, c: any) => sum + c.ctr, 0) / campaigns.length
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sponsored Campaigns</h1>
            <p className="text-gray-600 mt-2">Boost your products with paid visibility</p>
          </div>
          <button
            onClick={() => setShowCreateDrawer(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2"
          >
            <Plus className="h-5 w-5" />
            Create Campaign
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Campaigns</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{activeCampaigns.length}</p>
              </div>
              <div className="bg-green-100 rounded-full p-3">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Impressions</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalImpressions.toLocaleString()}</p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <Eye className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg CTR</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{(avgCTR * 100).toFixed(2)}%</p>
              </div>
              <div className="bg-purple-100 rounded-full p-3">
                <MousePointer className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Spent</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${totalSpent.toFixed(2)}</p>
              </div>
              <div className="bg-orange-100 rounded-full p-3">
                <DollarSign className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Campaigns List */}
        <div className="space-y-4">
          {campaigns?.map((campaign: any) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onPause={() => pauseMutation.mutate(campaign.id)}
            />
          ))}

          {campaigns?.length === 0 && (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Campaigns Yet</h3>
              <p className="text-gray-600 mb-6">
                Create your first sponsored campaign to boost product visibility
              </p>
              <button
                onClick={() => setShowCreateDrawer(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2"
              >
                <Plus className="h-5 w-5" />
                Create First Campaign
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignCard({ campaign, onPause }: any) {
  const budgetPercent = (campaign.spentUSD / campaign.totalBudgetUSD) * 100;
  const roi = campaign.revenue > 0 
    ? ((campaign.revenue - campaign.spentUSD) / campaign.spentUSD) * 100
    : 0;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              campaign.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
              campaign.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-800' :
              campaign.status === 'PENDING_APPROVAL' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {campaign.status}
            </span>
            <span className="text-sm text-gray-500">
              {new Date(campaign.startDate).toLocaleDateString()} - {new Date(campaign.endDate).toLocaleDateString()}
            </span>
          </div>
        </div>

        {campaign.status === 'ACTIVE' && (
          <button
            onClick={onPause}
            className="text-orange-600 hover:text-orange-700 flex items-center gap-2 text-sm font-medium"
          >
            <Pause className="h-4 w-4" />
            Pause
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-6 mb-4">
        <div>
          <p className="text-xs text-gray-600">Impressions</p>
          <p className="text-xl font-bold text-gray-900">{campaign.impressions.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Clicks</p>
          <p className="text-xl font-bold text-gray-900">{campaign.clicks.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">CTR</p>
          <p className="text-xl font-bold text-gray-900">{(campaign.ctr * 100).toFixed(2)}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-600">ROI</p>
          <p className={`text-xl font-bold ${roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {roi.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-600">Budget</span>
          <span className="font-medium text-gray-900">
            ${campaign.spentUSD.toFixed(2)} / ${campaign.totalBudgetUSD.toFixed(2)}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-full rounded-full ${
              budgetPercent >= 90 ? 'bg-red-600' :
              budgetPercent >= 70 ? 'bg-orange-500' :
              'bg-blue-600'
            }`}
            style={{ width: `${Math.min(100, budgetPercent)}%` }}
          />
        </div>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        Orders: {campaign.orders} | Revenue: ${campaign.revenue.toFixed(2)}
      </div>
    </div>
  );
}

