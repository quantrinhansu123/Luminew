import { IsString, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CustomerDataDto {
  @ApiPropertyOptional({ description: 'Customer full name (prefilled from lead)' })
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiPropertyOptional({ description: 'Customer phone (prefilled from lead)' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Customer email' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: 'Customer address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  @IsString()
  @IsOptional()
  company_name?: string;

  @ApiPropertyOptional({ description: 'Tax code' })
  @IsString()
  @IsOptional()
  tax_code?: string;
}

export class OrderDataDto {
  @ApiProperty({ description: 'Order description' })
  @IsString()
  description: string;

  @ApiProperty({ description: 'Total amount' })
  @IsNumber()
  total_amount: number;

  @ApiPropertyOptional({ description: 'Quantity' })
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Unit' })
  @IsString()
  @IsOptional()
  unit?: string;
}

export class FileUploadInfo {
  @ApiProperty({ description: 'Google Drive file ID' })
  @IsString()
  google_drive_id: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  file_name: string;

  @ApiPropertyOptional({ description: 'File type/mime' })
  @IsString()
  @IsOptional()
  file_type?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsNumber()
  @IsOptional()
  file_size_bytes?: number;

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  @IsString()
  @IsOptional()
  thumbnail_url?: string;
}

export class ConvertLeadDto {
  @ApiPropertyOptional({ description: 'Customer data (optional overrides)' })
  @ValidateNested()
  @Type(() => CustomerDataDto)
  @IsOptional()
  customer?: CustomerDataDto;

  @ApiProperty({ description: 'Order data' })
  @ValidateNested()
  @Type(() => OrderDataDto)
  order: OrderDataDto;

  @ApiPropertyOptional({ description: 'Uploaded files info' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FileUploadInfo)
  @IsOptional()
  files?: FileUploadInfo[];
}
