import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  customerId: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  productGroupId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  specifications?: any;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  totalAmount: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  finalAmount: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  salesEmployeeId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expectedDelivery?: string;
}

export class UpdateOrderDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  specifications?: any;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  totalAmount?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  finalAmount?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  expectedDelivery?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  actualDelivery?: string;
}

export class AddPaymentDto {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  method?: string;
}

export class AddDesignResultDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  google_drive_id: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  file_name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  file_type?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  file_size_bytes?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  thumbnail_url?: string;
}
