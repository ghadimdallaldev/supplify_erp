'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

/**
 * Admin Promotions Approval Page
 * Review and approve/reject supplier campaigns
 */
export default function AdminPromotionsPage() {
  const [tab, setTab] = useState<'pending' | 'active' | 'all'>('pending');
  const queryClient = useQueryClient();

  const { data: pending } = useQuery({
    queryKey: ['admin', 'promotions', 'pending'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query { pendingPromotionApprovals {
              id name supplierId status startDate endDate
              totalBudgetUSD targetType targetIds
            }}
          `,
        }),
      });
      const result = await response.json();
      return result.data?.pendingPromotionApprovals || [];
    },
  });

  const { data: active } = useQuery({
    queryKey: ['admin', 'promotions', 'active'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query { activeCampaigns {
              id name supplierId status spentUSD totalBudgetUSD impressions clicks
            }}
          `,
        }),
      });
      const result = await response.json();
      return result.data?.activeCampaigns || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation ApprovePromotion($input: ApprovePromotionInput!) {
              approvePromotion(input: $input) { id status }
            }
          `,
          variables: { input: { promotionId: id, note } },
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            mutation RejectPromotion($input: RejectPromotionInput!) {
              rejectPromotion(input: $input) { id status }
            }
          `,
          variables: { input: { promotionId: id, note } },
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotions'] });
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Promotions Management</h1>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setTab('pending')}
                className={`py-4 px-6 text-sm font-medium border-b-2 ${
                  tab === 'pending'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Clock className="inline h-4 w-4 mr-2" />
                Pending ({pending?.length || 0})
              </button>
              <button
                onClick={() => setTab('active')}
                className={`py-4 px-6 text-sm font-medium border-b-2 ${
                  tab === 'active'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <CheckCircle className="inline h-4 w-4 mr-2" />
                Active ({active?.length || 0})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {tab === 'pending' && (
              <div className="space-y-4">
                {pending?.map((promo: any) => (
                  <div key={promo.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{promo.name}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Supplier: {promo.supplierId} | Budget: ${promo.totalBudgetUSD}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">
                          Targeting: {promo.targetType} ({promo.targetIds.length} items)
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => approveMutation.mutate({ id: promo.id, note: 'Approved' })}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => rejectMutation.mutate({ id: promo.id, note: 'Policy violation' })}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {pending?.length === 0 && (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">No pending approvals</p>
                  </div>
                )}
              </div>
            )}

            {tab === 'active' && (
              <div className="space-y-4">
                {active?.map((campaign: any) => (
                  <div key={campaign.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                        <p className="text-sm text-gray-600">Supplier: {campaign.supplierId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">
                          ${campaign.spentUSD} / ${campaign.totalBudgetUSD}
                        </p>
                        <p className="text-xs text-gray-500">
                          {campaign.impressions} impressions, {campaign.clicks} clicks
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

