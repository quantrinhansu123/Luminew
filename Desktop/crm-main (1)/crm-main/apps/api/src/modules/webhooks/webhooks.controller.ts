import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { WebhookLeadDto } from './dto/webhook-lead.dto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('facebook')
  @ApiOperation({ summary: 'Receive lead from Facebook webhook' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid API key or bad request' })
  async facebookWebhook(
    @Headers('x-api-key') apiKey: string,
    @Body() data: WebhookLeadDto,
  ) {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }
    return this.webhooksService.handleFacebookWebhook(apiKey, data);
  }

  @Post('zalo')
  @ApiOperation({ summary: 'Receive lead from Zalo webhook' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid API key or bad request' })
  async zaloWebhook(
    @Headers('x-api-key') apiKey: string,
    @Body() data: WebhookLeadDto,
  ) {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }
    return this.webhooksService.handleZaloWebhook(apiKey, data);
  }

  @Post('tiktok')
  @ApiOperation({ summary: 'Receive lead from TikTok webhook' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid API key or bad request' })
  async tiktokWebhook(
    @Headers('x-api-key') apiKey: string,
    @Body() data: WebhookLeadDto,
  ) {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }
    return this.webhooksService.handleTiktokWebhook(apiKey, data);
  }

  @Post('website')
  @ApiOperation({ summary: 'Receive lead from website form' })
  @ApiHeader({ name: 'x-api-key', required: true })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid API key or bad request' })
  async websiteWebhook(
    @Headers('x-api-key') apiKey: string,
    @Body() data: WebhookLeadDto,
  ) {
    if (!apiKey) {
      throw new BadRequestException('API key is required');
    }
    return this.webhooksService.handleWebsiteWebhook(apiKey, data);
  }
}
