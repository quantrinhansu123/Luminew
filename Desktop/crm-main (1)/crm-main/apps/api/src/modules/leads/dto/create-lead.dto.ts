import { IsString, IsOptional, IsInt, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLeadDto {
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

  @ApiProperty()
  @IsInt()
  source_id: number;

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
}
