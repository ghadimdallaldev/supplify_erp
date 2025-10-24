import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  Headers,
  UseGuards 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto, CampaignStatusDto } from './dto/campaign.dto';
import { Campaign, CampaignKpis } from './types/campaign.types';

@ApiTags('campaigns')
@Controller('campaigns')
@ApiBearerAuth()
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponse({ status: 201, description: 'Campaign created successfully' })
  async createCampaign(
    @Body() dto: CreateCampaignDto,
    @Headers('x-supplier-id') supplierId: string,
    @Headers('x-user-id') userId: string,
  ): Promise<Campaign> {
    return this.campaignsService.createCampaign(supplierId, userId, dto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get campaigns for current supplier' })
  async getMyCampaigns(
    @Query('status') status: string,
    @Headers('x-supplier-id') supplierId: string,
  ): Promise<Campaign[]> {
    return this.campaignsService.getCampaignsBySupplier(supplierId, status);
  }

  @Get('my/kpis')
  @ApiOperation({ summary: 'Get campaign KPIs for current supplier' })
  async getMyCampaignKpis(
    @Headers('x-supplier-id') supplierId: string,
  ): Promise<CampaignKpis> {
    return this.campaignsService.getCampaignStats(supplierId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  async getCampaign(@Param('id') id: string): Promise<Campaign> {
    return this.campaignsService.getCampaignById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update campaign' })
  async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @Headers('x-supplier-id') supplierId: string,
  ): Promise<Campaign> {
    return this.campaignsService.updateCampaign(id, supplierId, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update campaign status' })
  async updateCampaignStatus(
    @Param('id') id: string,
    @Body() dto: CampaignStatusDto,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') userRole: string,
  ): Promise<Campaign> {
    // Only admins can approve/reject, suppliers can pause/resume their own
    if (['ACTIVE', 'REJECTED'].includes(dto.status) && userRole !== 'admin') {
      throw new Error('Only admins can approve or reject campaigns');
    }
    
    return this.campaignsService.updateCampaignStatus(id, dto.status as any, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete campaign' })
  async deleteCampaign(
    @Param('id') id: string,
    @Headers('x-supplier-id') supplierId: string,
  ): Promise<boolean> {
    return this.campaignsService.deleteCampaign(id, supplierId);
  }

  // Admin endpoints
  @Get('admin/review')
  @ApiOperation({ summary: 'Get campaigns pending review (admin only)' })
  async getCampaignsForReview(
    @Query('status') status: string,
    @Headers('x-user-role') userRole: string,
  ): Promise<Campaign[]> {
    if (userRole !== 'admin') {
      throw new Error('Admin access required');
    }
    
    return this.campaignsService.getCampaignsForReview(status);
  }
}
