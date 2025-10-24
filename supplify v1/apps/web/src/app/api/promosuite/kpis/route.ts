import { NextRequest, NextResponse } from 'next/server';
import { getCampaigns } from '@/lib/campaigns-store';

export async function GET(request: NextRequest) {
  try {
    // Calculate KPIs from actual campaign data
    const supplierCampaigns = getCampaigns().filter(c => c.supplierId === 'sup_current');
    
    const active = supplierCampaigns.filter(c => c.status === 'ACTIVE').length;
    const totalBudgetUSD = supplierCampaigns.reduce((sum, c) => sum + (c.totalBudgetUSD || 0), 0);
    const totalSpentUSD = supplierCampaigns.reduce((sum, c) => sum + (c.spentUSD || 0), 0);
    const discountCampaigns = supplierCampaigns.filter(c => c.type === 'DISCOUNT').length;
    const featuredProducts = supplierCampaigns.filter(c => c.type === 'FEATURED_PRODUCT').length;
    
    const mockKpis = {
      active,
      totalBudgetUSD,
      totalSpentUSD,
      totalImpressions: 0, // Would be calculated from actual stats
      totalClicks: 0, // Would be calculated from actual stats
      ctr: 0, // Would be calculated from actual stats
      discountCampaigns,
      featuredProducts,
    };

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));

    return NextResponse.json(mockKpis);
  } catch (error) {
    console.error('Error fetching KPIs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch KPIs' },
      { status: 500 }
    );
  }
}
