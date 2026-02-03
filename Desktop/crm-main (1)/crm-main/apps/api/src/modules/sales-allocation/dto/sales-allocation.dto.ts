import { IsString, IsArray, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalesAllocationDto {
  @ApiProperty({ example: 'SA001' })
  @IsString()
  rule_code: string;

  @ApiPropertyOptional({ example: 'Khách hàng doanh nghiệp' })
  @IsString()
  @IsOptional()
  customer_group?: string;

  @ApiPropertyOptional({ example: [1, 2, 3], description: 'Array of product group IDs' })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  product_group_ids?: number[];

  @ApiPropertyOptional({ example: [1, 2], description: 'Array of sales employee IDs' })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  assigned_sales_ids?: number[];
}

export class UpdateSalesAllocationDto {
  @ApiPropertyOptional({ example: 'Khách hàng doanh nghiệp' })
  @IsString()
  @IsOptional()
  customer_group?: string;

  @ApiPropertyOptional({ example: [1, 2, 3] })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  product_group_ids?: number[];

  @ApiPropertyOptional({ example: [1, 2] })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  assigned_sales_ids?: number[];

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
