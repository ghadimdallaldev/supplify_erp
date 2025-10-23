import { NextRequest, NextResponse } from 'next/server';
import { getCampaigns, addCampaign, saveCampaigns } from '@/lib/campaigns-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Create new campaign
    const newCampaign = {
      id: `cmp_${Date.now()}`,
      supplierId: 'sup_current', // In real implementation, get from auth
      supplierName: 'Current Supplier', // In real implementation, get from user data
      ...body,
      status: 'PENDING', // Always create as PENDING
      approved: false,
      spentUSD: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to shared campaigns array
    addCampaign(newCampaign);

    // Save campaigns to persistent storage
    await saveCampaigns();

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    return NextResponse.json(newCampaign);
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json(
      { error: 'Failed to create campaign' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get campaigns for current supplier - in real implementation, filter by supplier ID
    const supplierCampaigns = getCampaigns().filter(c => c.supplierId === 'sup_current');

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json(supplierCampaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}
