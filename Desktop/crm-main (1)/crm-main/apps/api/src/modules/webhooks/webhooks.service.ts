import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookLeadDto } from './dto/webhook-lead.dto';

@Injectable()
export class WebhooksService {
  constructor(private prisma: PrismaService) {}

  async handleFacebookWebhook(apiKey: string, data: WebhookLeadDto) {
    return this.processWebhookLead(apiKey, 'facebook', data);
  }

  async handleZaloWebhook(apiKey: string, data: WebhookLeadDto) {
    return this.processWebhookLead(apiKey, 'zalo', data);
  }

  async handleTiktokWebhook(apiKey: string, data: WebhookLeadDto) {
    return this.processWebhookLead(apiKey, 'tiktok', data);
  }

  async handleWebsiteWebhook(apiKey: string, data: WebhookLeadDto) {
    return this.processWebhookLead(apiKey, 'website', data);
  }

  private async processWebhookLead(
    apiKey: string,
    sourceType: string,
    data: WebhookLeadDto,
  ) {
    // Find lead source by API key
    const leadSource = await this.prisma.lead_sources.findFirst({
      where: {
        api_key: apiKey,
        type: sourceType as any,
        is_active: true,
      },
    });

    if (!leadSource) {
      throw new BadRequestException('Invalid API key or inactive lead source');
    }

    // Find campaign by code if provided
    let campaignId: number | undefined;
    if (data.campaign_code) {
      const campaign = await this.prisma.campaigns.findFirst({
        where: {
          code: data.campaign_code,
          source_id: leadSource.id,
          is_active: true,
        },
      });
      campaignId = campaign?.id;
    }

    // Create lead
    const lead = await this.prisma.leads.create({
      data: {
        full_name: data.full_name,
        phone: data.phone,
        email: data.email,
        demand: data.demand,
        source_id: leadSource.id,
        campaign_id: campaignId,
        source_label: data.source_label || `${sourceType}_webhook`,
        interested_product_group_id: data.interested_product_group_id,
        status: 'new',
      },
    });

    // Call auto-assign function (if exists in database)
    try {
      await this.prisma.$queryRaw`SELECT auto_assign_lead(${lead.id})`;
    } catch (error) {
      console.log('Auto-assign function not available:', error.message);
    }

    return {
      success: true,
      lead_id: lead.id,
      message: 'Lead created successfully',
    };
  }
}
