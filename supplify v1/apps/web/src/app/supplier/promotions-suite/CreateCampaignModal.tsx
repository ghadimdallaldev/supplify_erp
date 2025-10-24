'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { X, Calendar, DollarSign, Target, Hash } from 'lucide-react';
// import { toast } from 'sonner';

interface CreateCampaignModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type CampaignType = 'SPONSORED_VISIBILITY' | 'DISCOUNT' | 'FEATURED_PRODUCT';
type DiscountType = 'PERCENT' | 'AMOUNT';

export function CreateCampaignModal({ onClose, onSuccess }: CreateCampaignModalProps) {
  const queryClient = useQueryClient();
  const [campaignType, setCampaignType] = useState<CampaignType>('SPONSORED_VISIBILITY');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    placement: '',
    startDate: '',
    endDate: '',
    dailyBudgetUSD: '',
    totalBudgetUSD: '',
    cpmUSD: '',
    cpcUSD: '',
    targetType: 'PRODUCT',
    targetIds: '',
    keywords: '',
    priorityScore: '1.0',
    discountType: 'PERCENT' as DiscountType,
    discountValue: '',
    minQty: '',
    featureSlots: '1',
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/promosuite/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create campaign');
      return response.json();
    },
    onSuccess: () => {
      alert('Campaign created successfully! It is now pending admin approval.');
      queryClient.invalidateQueries({ queryKey: ['promosuite-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['promosuite-kpis'] });
      onSuccess();
    },
    onError: (error) => {
      alert(error.message || 'Failed to create campaign');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData: any = {
      type: campaignType,
      name: formData.name,
      description: formData.description,
      startDate: formData.startDate,
      endDate: formData.endDate,
      targetType: formData.targetType,
      targetIds: formData.targetIds.split(',').map(id => id.trim()).filter(Boolean),
      keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
      priorityScore: parseFloat(formData.priorityScore),
    };

    // Add type-specific fields
    if (campaignType === 'SPONSORED_VISIBILITY') {
      submitData.placement = formData.placement;
      submitData.totalBudgetUSD = parseFloat(formData.totalBudgetUSD);
      submitData.dailyBudgetUSD = formData.dailyBudgetUSD ? parseFloat(formData.dailyBudgetUSD) : undefined;
      submitData.cpmUSD = parseFloat(formData.cpmUSD);
      submitData.cpcUSD = formData.cpcUSD ? parseFloat(formData.cpcUSD) : undefined;
    } else if (campaignType === 'DISCOUNT') {
      submitData.discountType = formData.discountType;
      submitData.discountValue = parseFloat(formData.discountValue);
      submitData.minQty = formData.minQty ? parseInt(formData.minQty) : undefined;
    } else if (campaignType === 'FEATURED_PRODUCT') {
      submitData.featureSlots = parseInt(formData.featureSlots);
    }

    createCampaignMutation.mutate(submitData);
  };

  const getCampaignTypeDescription = (type: CampaignType) => {
    switch (type) {
      case 'SPONSORED_VISIBILITY':
        return 'Boost your supplier card and products to the top of search results and listings';
      case 'DISCOUNT':
        return 'Create temporary discounts on selected products with automatic price display';
      case 'FEATURED_PRODUCT':
        return 'Pin chosen products to the top of your supplier storefront';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create Campaign</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Campaign Type Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Campaign Type
                </CardTitle>
                <CardDescription>Choose the type of promotional campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(['SPONSORED_VISIBILITY', 'DISCOUNT', 'FEATURED_PRODUCT'] as CampaignType[]).map((type) => (
                  <div
                    key={type}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      campaignType === type ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setCampaignType(type)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {type === 'SPONSORED_VISIBILITY' && 'Sponsored Visibility'}
                          {type === 'DISCOUNT' && 'Discount Campaign'}
                          {type === 'FEATURED_PRODUCT' && 'Featured Product'}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">
                          {getCampaignTypeDescription(type)}
                        </p>
                      </div>
                      <Badge variant={campaignType === type ? 'default' : 'outline'}>
                        {campaignType === type ? 'Selected' : 'Select'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Campaign Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter campaign name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe your campaign"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date *</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sponsored Visibility Specific Fields */}
            {campaignType === 'SPONSORED_VISIBILITY' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Sponsored Visibility Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="placement">Placement *</Label>
                    <Select value={formData.placement} onValueChange={(value) => setFormData({ ...formData, placement: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select placement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUPPLIER_CARD">Supplier Card</SelectItem>
                        <SelectItem value="PRODUCT_LIST">Product List</SelectItem>
                        <SelectItem value="SEARCH_RESULT">Search Results</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="totalBudgetUSD">Total Budget (USD) *</Label>
                      <Input
                        id="totalBudgetUSD"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.totalBudgetUSD}
                        onChange={(e) => setFormData({ ...formData, totalBudgetUSD: e.target.value })}
                        placeholder="100.00"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="dailyBudgetUSD">Daily Budget (USD)</Label>
                      <Input
                        id="dailyBudgetUSD"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={formData.dailyBudgetUSD}
                        onChange={(e) => setFormData({ ...formData, dailyBudgetUSD: e.target.value })}
                        placeholder="10.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cpmUSD">CPM (USD) *</Label>
                      <Input
                        id="cpmUSD"
                        type="number"
                        step="0.0001"
                        min="0.01"
                        value={formData.cpmUSD}
                        onChange={(e) => setFormData({ ...formData, cpmUSD: e.target.value })}
                        placeholder="1.0000"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="cpcUSD">CPC (USD)</Label>
                      <Input
                        id="cpcUSD"
                        type="number"
                        step="0.0001"
                        min="0.01"
                        value={formData.cpcUSD}
                        onChange={(e) => setFormData({ ...formData, cpcUSD: e.target.value })}
                        placeholder="0.50"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Discount Campaign Specific Fields */}
            {campaignType === 'DISCOUNT' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-5 w-5" />
                    Discount Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="discountType">Discount Type *</Label>
                    <Select value={formData.discountType} onValueChange={(value) => setFormData({ ...formData, discountType: value as DiscountType })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENT">Percentage</SelectItem>
                        <SelectItem value="AMOUNT">Fixed Amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="discountValue">Discount Value *</Label>
                      <Input
                        id="discountValue"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={formData.discountType === 'PERCENT' ? '90' : undefined}
                        value={formData.discountValue}
                        onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                        placeholder={formData.discountType === 'PERCENT' ? '15' : '5.00'}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="minQty">Minimum Quantity</Label>
                      <Input
                        id="minQty"
                        type="number"
                        min="1"
                        value={formData.minQty}
                        onChange={(e) => setFormData({ ...formData, minQty: e.target.value })}
                        placeholder="2"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Featured Product Specific Fields */}
            {campaignType === 'FEATURED_PRODUCT' && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Featured Product Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="featureSlots">Feature Slots *</Label>
                    <Select value={formData.featureSlots} onValueChange={(value) => setFormData({ ...formData, featureSlots: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Slot</SelectItem>
                        <SelectItem value="2">2 Slots</SelectItem>
                        <SelectItem value="3">3 Slots</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-gray-600 mt-1">
                      Number of top positions to claim on your supplier page
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Targeting */}
            <Card>
              <CardHeader>
                <CardTitle>Targeting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="targetType">Target Type *</Label>
                  <Select value={formData.targetType} onValueChange={(value) => setFormData({ ...formData, targetType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRODUCT">Products</SelectItem>
                      <SelectItem value="CATEGORY">Categories</SelectItem>
                      <SelectItem value="SUPPLIER">Suppliers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="targetIds">Target IDs *</Label>
                  <Input
                    id="targetIds"
                    value={formData.targetIds}
                    onChange={(e) => setFormData({ ...formData, targetIds: e.target.value })}
                    placeholder="product1, product2, product3"
                    required
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Comma-separated list of {formData.targetType.toLowerCase()} IDs
                  </p>
                </div>

                <div>
                  <Label htmlFor="keywords">Keywords</Label>
                  <Input
                    id="keywords"
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="keyword1, keyword2, keyword3"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Comma-separated list of keywords for targeting
                  </p>
                </div>

                <div>
                  <Label htmlFor="priorityScore">Priority Score</Label>
                  <Input
                    id="priorityScore"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    value={formData.priorityScore}
                    onChange={(e) => setFormData({ ...formData, priorityScore: e.target.value })}
                    placeholder="1.0"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Higher scores get better placement (0.1 - 10.0)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCampaignMutation.isPending}>
                {createCampaignMutation.isPending ? 'Creating...' : 'Create Campaign'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
