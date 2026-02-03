import { IsString, IsOptional, IsInt, IsEmail, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookLeadDto {
  @ApiProperty()
  @IsString()
  full_name: string;

  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  demand?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  source_label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  campaign_code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  interested_product_group_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
