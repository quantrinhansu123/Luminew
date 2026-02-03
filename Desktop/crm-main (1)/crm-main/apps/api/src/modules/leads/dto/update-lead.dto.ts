import { IsEnum, IsString, IsOptional, IsInt, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { lead_status, assignment_method } from '@prisma/client';

export class UpdateLeadDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

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
  @IsInt()
  source_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  campaign_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  customer_group?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  interested_product_group_id?: number;

  @ApiProperty({ enum: lead_status, required: false })
  @IsOptional()
  @IsEnum(lead_status)
  status?: lead_status;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  assigned_sales_id?: number;

  @ApiProperty({ enum: assignment_method, required: false })
  @IsOptional()
  @IsEnum(assignment_method)
  assignment_method?: assignment_method;
}
