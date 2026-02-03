import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, MaxLength, IsDecimal } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBaoCaoMktDto {
  @ApiProperty({ description: 'Họ và tên' })
  @IsString()
  @MaxLength(100)
  ho_va_ten: string;

  @ApiPropertyOptional({ description: 'Page' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  page?: string;

  @ApiPropertyOptional({ description: 'Chi phí quảng cáo' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cpqc?: number;

  @ApiPropertyOptional({ description: 'Số message' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  so_mess?: number;

  @ApiPropertyOptional({ description: 'Số đơn' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  so_don?: number;

  @ApiPropertyOptional({ description: 'Chi phí sản xuất' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  cps?: number;

  @ApiPropertyOptional({ description: 'Tỉ lệ chốt (%)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  ti_le_chot?: number;
}

export class UpdateBaoCaoMktDto extends PartialType(CreateBaoCaoMktDto) {}
