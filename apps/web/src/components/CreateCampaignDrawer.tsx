'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Calendar } from 'lucide-react';
import { graphqlMutation } from '@/lib/graphql-client';

interface CreateCampaignDrawerProps {
  open: boolean;
  onClose: () => void;
  supplierId: string;
}

/**
 * Create Campaign Drawer
 * Form to create new sponsored campaigns
 */
export function CreateCampaignDrawer({ open, onClose, supplierId }: CreateCampaignDrawerProps) {
  const [formData, setFormData] = useState({
    name: '',
    targetType: 'PRODUCT' as 'PRODUCT' | 'CATEGORY' | 'SUPPLIER',
    targetIds: [] as string[],
    dailyBudgetUSD: 10,
    totalBudgetUSD: 100,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    billingModel: 'CPM' as 'CPM' | 'CPC' | 'HYBRID',
    cpmUSD: 1.0,
    cpcUSD: 0.1,
    keywords: '',
  });

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return graphqlMutation(`
        mutation CreatePromotion($input: CreatePromotionInput!) {
          createPromotion(input: $input) {
            id
            name
            status
          }
        }
      `, {
        input: {
          ...data,
          keywords: data.keywords.split(',').map((k: string) => k.trim()).filter(Boolean),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-end">
      <div className="bg-white w-full sm:w-[600px] h-full sm:h-auto sm:max-h-[90vh] overflow-y-auto">
        <div className="border-b px-6 py-4 flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-xl font-semibold">Create Sponsored Campaign</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Summer Special - Fresh Chicken"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What to Promote
            </label>
            <select
              value={formData.targetType}
              onChange={(e) => setFormData({ ...formData, targetType: e.target.value as any })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="PRODUCT">Specific Products</option>
              <option value="CATEGORY">Product Category</option>
              <option value="SUPPLIER">Entire Catalog</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Daily Budget (USD) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={formData.dailyBudgetUSD}
                onChange={(e) => setFormData({ ...formData, dailyBudgetUSD: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Budget (USD) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="1"
                step="0.01"
                value={formData.totalBudgetUSD}
                onChange={(e) => setFormData({ ...formData, totalBudgetUSD: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Billing Model
            </label>
            <div className="space-y-2">
              {[
                { value: 'CPM', label: 'CPM (Cost per 1000 impressions)', desc: `$${formData.cpmUSD} per 1000 views` },
                { value: 'CPC', label: 'CPC (Cost per click)', desc: `$${formData.cpcUSD} per click` },
                { value: 'HYBRID', label: 'Hybrid (Both CPM + CPC)', desc: 'Balanced approach' },
              ].map((option) => (
                <label key={option.value} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="billingModel"
                    value={option.value}
                    checked={formData.billingModel === option.value}
                    onChange={(e) => setFormData({ ...formData, billingModel: e.target.value as any })}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{option.label}</div>
                    <div className="text-xs text-gray-500">{option.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Keywords (comma-separated)
            </label>
            <input
              type="text"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="e.g., chicken, poultry, fresh, protein"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Used for matching search queries</p>
          </div>

          <div className="flex gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Campaign
                </>
              )}
            </button>
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700">
                {(createMutation.error as any)?.message || 'Failed to create campaign'}
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

