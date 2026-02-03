import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateKpisDto {
  @ApiProperty({ description: 'Họ tên' })
  @IsString()
  @MaxLength(100)
  ho_ten: string;

  @ApiPropertyOptional({ description: 'Bộ phận' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bo_phan?: string;

  @ApiPropertyOptional({ description: 'KPI tháng' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  kpi_thang?: number;

  @ApiPropertyOptional({ description: 'KPI tuần' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  kpi_tuan?: number;

  @ApiPropertyOptional({ description: 'KPI ngày' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  kpi_ngay?: number;
}

export class UpdateKpisDto extends PartialType(CreateKpisDto) {}
