import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';

@Injectable()
export class PromoSuiteBudgetService {
  private readonly logger = new Logger(PromoSuiteBudgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    @Inject('NOTIFICATIONS_SERVICE') private readonly notificationsClient: ClientProxy,
  ) {}

  /**
   * Check and handle budget exhaustion for all active campaigns
   */
  async checkBudgetExhaustion(): Promise<void> {
    try {
      const now = new Date();
      
      // Get all active campaigns
      const activeCampaigns = await this.prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
        },
      });

      for (const campaign of activeCampaigns) {
        await this.checkCampaignBudget(campaign);
      }

      this.logger.log(`Checked budget exhaustion for ${activeCampaigns.length} campaigns`);
    } catch (error) {
      this.logger.error('Error checking budget exhaustion:', error);
    }
  }

  /**
   * Check individual campaign budget
   */
  private async checkCampaignBudget(campaign: any): Promise<void> {
    try {
      const currentSpend = campaign.spentUSD || 0;
      let shouldPause = false;
      let reason = '';

      // Check total budget
      if (campaign.totalBudgetUSD && currentSpend >= campaign.totalBudgetUSD) {
        shouldPause = true;
        reason = 'Total budget exhausted';
      }

      // Check daily budget
      if (!shouldPause && campaign.dailyBudgetUSD) {
        const todaySpend = await this.getTodaySpend(campaign.id);
        if (todaySpend >= campaign.dailyBudgetUSD) {
          shouldPause = true;
          reason = 'Daily budget exhausted';
        }
      }

      if (shouldPause) {
        await this.pauseCampaignForBudgetExhaustion(campaign, reason);
      }
    } catch (error) {
      this.logger.error(`Error checking budget for campaign ${campaign.id}:`, error);
    }
  }

  /**
   * Check campaigns ending soon and send notifications
   */
  async checkCampaignsEndingSoon(): Promise<void> {
    try {
      const now = new Date();
      const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // Find campaigns ending in the next 24 hours
      const endingSoonCampaigns = await this.prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          endDate: {
            gte: now,
            lte: twentyFourHoursFromNow,
          },
        },
        include: {
          // Include supplier details for notifications
        },
      });

      for (const campaign of endingSoonCampaigns) {
        await this.sendEndingSoonNotification(campaign);
      }

      this.logger.log(`Checked ${endingSoonCampaigns.length} campaigns ending soon`);
    } catch (error) {
      this.logger.error('Error checking campaigns ending soon:', error);
    }
  }

  /**
   * Reset daily spend counters at midnight UTC
   */
  async resetDailyCounters(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      // Clear yesterday's daily spend cache
      const cacheKeys = await this.redis.keys('promosuite:daily_spend:*');
      if (cacheKeys.length > 0) {
        await this.redis.del(...cacheKeys);
      }

      this.logger.log('Daily spend counters reset');
    } catch (error) {
      this.logger.error('Error resetting daily counters:', error);
    }
  }

  /**
   * Send budget exhaustion notification
   */
  private async sendBudgetExhaustionNotification(campaign: any, reason: string): Promise<void> {
    try {
      const notification = {
        type: 'CAMPAIGN_BUDGET_EXHAUSTED',
        recipientId: campaign.createdBy,
        recipientType: 'USER',
        title: 'Campaign Budget Exhausted',
        message: `Your campaign "${campaign.name}" has been paused because ${reason.toLowerCase()}.`,
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          reason,
          spentUSD: campaign.spentUSD,
          totalBudgetUSD: campaign.totalBudgetUSD,
          dailyBudgetUSD: campaign.dailyBudgetUSD,
        },
        priority: 'HIGH',
        channels: ['IN_APP', 'EMAIL'],
      };

      // Send in-app notification
      this.notificationsClient.emit('notifications.create', notification);

      // Send email notification
      const emailData = {
        to: campaign.supplierEmail, // Assuming we have supplier email
        template: 'campaign_budget_exhausted',
        data: {
          campaignName: campaign.name,
          reason,
          spentUSD: campaign.spentUSD,
          totalBudgetUSD: campaign.totalBudgetUSD,
          dailyBudgetUSD: campaign.dailyBudgetUSD,
          dashboardUrl: `${process.env.FRONTEND_URL}/supplier/promotions-suite/${campaign.id}`,
        },
      };

      this.notificationsClient.emit('notifications.email', emailData);

      this.logger.log(`Sent budget exhaustion notification for campaign ${campaign.id}`);
    } catch (error) {
      this.logger.error('Error sending budget exhaustion notification:', error);
    }
  }

  /**
   * Send campaign ending soon notification
   */
  private async sendEndingSoonNotification(campaign: any): Promise<void> {
    try {
      const hoursRemaining = Math.ceil((campaign.endDate.getTime() - Date.now()) / (1000 * 60 * 60));

      const notification = {
        type: 'CAMPAIGN_ENDING_SOON',
        recipientId: campaign.createdBy,
        recipientType: 'USER',
        title: 'Campaign Ending Soon',
        message: `Your campaign "${campaign.name}" will end in ${hoursRemaining} hours.`,
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          endDate: campaign.endDate,
          hoursRemaining,
        },
        priority: 'MEDIUM',
        channels: ['IN_APP', 'EMAIL'],
      };

      // Send in-app notification
      this.notificationsClient.emit('notifications.create', notification);

      // Send email notification
      const emailData = {
        to: campaign.supplierEmail,
        template: 'campaign_ending_soon',
        data: {
          campaignName: campaign.name,
          endDate: campaign.endDate,
          hoursRemaining,
          dashboardUrl: `${process.env.FRONTEND_URL}/supplier/promotions-suite/${campaign.id}`,
        },
      };

      this.notificationsClient.emit('notifications.email', emailData);

      this.logger.log(`Sent ending soon notification for campaign ${campaign.id}`);
    } catch (error) {
      this.logger.error('Error sending ending soon notification:', error);
    }
  }

  /**
   * Send campaign approval notification
   */
  async sendApprovalNotification(campaign: any, approved: boolean, reason?: string): Promise<void> {
    try {
      const notification = {
        type: approved ? 'CAMPAIGN_APPROVED' : 'CAMPAIGN_REJECTED',
        recipientId: campaign.createdBy,
        recipientType: 'USER',
        title: approved ? 'Campaign Approved' : 'Campaign Rejected',
        message: approved 
          ? `Your campaign "${campaign.name}" has been approved and is now active.`
          : `Your campaign "${campaign.name}" has been rejected. ${reason || ''}`,
        data: {
          campaignId: campaign.id,
          campaignName: campaign.name,
          approved,
          reason,
          approvedBy: campaign.approvedBy,
          approvedAt: campaign.approvedAt,
        },
        priority: 'HIGH',
        channels: ['IN_APP', 'EMAIL'],
      };

      // Send in-app notification
      this.notificationsClient.emit('notifications.create', notification);

      // Send email notification
      const emailData = {
        to: campaign.supplierEmail,
        template: approved ? 'campaign_approved' : 'campaign_rejected',
        data: {
          campaignName: campaign.name,
          approved,
          reason,
          approvedBy: campaign.approvedBy,
          approvedAt: campaign.approvedAt,
          dashboardUrl: `${process.env.FRONTEND_URL}/supplier/promotions-suite/${campaign.id}`,
        },
      };

      this.notificationsClient.emit('notifications.email', emailData);

      this.logger.log(`Sent ${approved ? 'approval' : 'rejection'} notification for campaign ${campaign.id}`);
    } catch (error) {
      this.logger.error('Error sending approval notification:', error);
    }
  }

  /**
   * Send admin daily digest
   */
  async sendAdminDailyDigest(): Promise<void> {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get pending campaigns count
      const pendingCount = await this.prisma.campaign.count({
        where: { status: 'PENDING' },
      });

      // Get total ad spend for yesterday
      const yesterdaySpend = await this.prisma.adStat.aggregate({
        where: {
          day: {
            gte: yesterday,
            lt: now,
          },
        },
        _sum: {
          spendUSD: true,
        },
      });

      // Get active campaigns count
      const activeCount = await this.prisma.campaign.count({
        where: { status: 'ACTIVE' },
      });

      const digestData = {
        pendingCampaigns: pendingCount,
        activeCampaigns: activeCount,
        yesterdaySpend: yesterdaySpend._sum.spendUSD || 0,
        date: yesterday.toISOString().split('T')[0],
      };

      // Send to all admin users
      const adminUsers = await this.prisma.user.findMany({
        where: { role: 'ADMIN' },
      });

      for (const admin of adminUsers) {
        const notification = {
          type: 'ADMIN_DAILY_DIGEST',
          recipientId: admin.id,
          recipientType: 'USER',
          title: 'Daily PromoSuite Digest',
          message: `${pendingCount} campaigns pending review, ${activeCount} active campaigns, $${(digestData.yesterdaySpend).toFixed(2)} spent yesterday.`,
          data: digestData,
          priority: 'LOW',
          channels: ['IN_APP', 'EMAIL'],
        };

        this.notificationsClient.emit('notifications.create', notification);
      }

      this.logger.log(`Sent daily digest to ${adminUsers.length} admin users`);
    } catch (error) {
      this.logger.error('Error sending admin daily digest:', error);
    }
  }

  /**
   * Get campaign performance summary
   */
  async getCampaignPerformanceSummary(campaignId: string): Promise<any> {
    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          stats: {
            orderBy: { day: 'desc' },
            take: 30, // Last 30 days
          },
        },
      });

      if (!campaign) {
        return null;
      }

      const totalImpressions = campaign.stats.reduce((sum, stat) => sum + stat.impressions, 0);
      const totalClicks = campaign.stats.reduce((sum, stat) => sum + stat.clicks, 0);
      const totalSpend = campaign.stats.reduce((sum, stat) => sum + Number(stat.spendUSD), 0);
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        totalImpressions,
        totalClicks,
        totalSpend,
        ctr: Number(ctr.toFixed(2)),
        budgetUtilization: campaign.totalBudgetUSD ? (campaign.spentUSD / campaign.totalBudgetUSD) * 100 : 0,
        dailyBudgetUtilization: campaign.dailyBudgetUSD ? (await this.getTodaySpend(campaignId) / campaign.dailyBudgetUSD) * 100 : 0,
        daysRemaining: Math.ceil((campaign.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        recentStats: campaign.stats.slice(0, 7), // Last 7 days
      };
    } catch (error) {
      this.logger.error('Error getting campaign performance summary:', error);
      return null;
    }
  }

  /**
   * Helper methods
   */
  private async getTodaySpend(campaignId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = await this.prisma.adStat.findFirst({
      where: {
        campaignId,
        day: today,
      },
    });

    return stats?.spendUSD || 0;
  }

  private async pauseCampaignForBudgetExhaustion(campaign: any, reason: string): Promise<void> {
    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { 
        status: 'EXHAUSTED',
        updatedAt: new Date(),
      },
    });

    // Send notification
    await this.sendBudgetExhaustionNotification(campaign, reason);

    // Clear cache
    await this.clearCampaignCache(campaign.placement);

    this.logger.log(`Campaign ${campaign.id} paused due to budget exhaustion: ${reason}`);
  }

  private async clearCampaignCache(placement?: string): Promise<void> {
    if (placement) {
      await this.redis.del(`promosuite:eligible:v1:${placement}`);
    } else {
      const keys = await this.redis.keys('promosuite:eligible:v1:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
