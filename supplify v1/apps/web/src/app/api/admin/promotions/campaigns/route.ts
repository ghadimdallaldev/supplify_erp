import { NextRequest, NextResponse } from 'next/server';
import { getCampaigns, saveCampaigns, updateCampaign } from '@/lib/campaigns-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let filteredCampaigns = [...getCampaigns()];

    // Filter by status
    if (status && status !== 'all') {
      filteredCampaigns = filteredCampaigns.filter(campaign => campaign.status === status);
    }

    // Filter by search query
    if (search) {
      const searchLower = search.toLowerCase();
      filteredCampaigns = filteredCampaigns.filter(campaign => 
        campaign.name.toLowerCase().includes(searchLower) ||
        campaign.supplierName.toLowerCase().includes(searchLower) ||
        campaign.description?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by creation date (newest first)
    filteredCampaigns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return NextResponse.json(filteredCampaigns);
  } catch (error) {
    console.error('Error fetching admin campaigns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');
    const action = searchParams.get('action');

    if (!campaignId || !action) {
      return NextResponse.json(
        { error: 'Campaign ID and action are required' },
        { status: 400 }
      );
    }

    const campaigns = getCampaigns();
    const campaignIndex = campaigns.findIndex(c => c.id === campaignId);
    if (campaignIndex === -1) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    const campaign = campaigns[campaignIndex];
    let updatedCampaign;

    switch (action) {
      case 'approve':
        updatedCampaign = updateCampaign(campaignId, {
          status: 'ACTIVE',
          approved: true,
          approvedBy: 'admin_current',
          approvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        break;

      case 'reject':
        updatedCampaign = updateCampaign(campaignId, {
          status: 'REJECTED',
          approved: false,
          updatedAt: new Date().toISOString(),
        });
        break;

      case 'pause':
        updatedCampaign = updateCampaign(campaignId, {
          status: 'PAUSED',
          updatedAt: new Date().toISOString(),
        });
        break;

      case 'resume':
        updatedCampaign = updateCampaign(campaignId, {
          status: 'ACTIVE',
          updatedAt: new Date().toISOString(),
        });
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    if (!updatedCampaign) {
      return NextResponse.json(
        { error: 'Failed to update campaign' },
        { status: 500 }
      );
    }

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 300));

    // Save campaigns to persistent storage
    await saveCampaigns();

    return NextResponse.json({
      success: true,
      campaign: updatedCampaign,
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    return NextResponse.json(
      { error: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

// Export the campaigns array and save function so it can be accessed by other APIs
// export { campaigns, saveCampaigns };
