import { PartialType } from '@nestjs/swagger';
import { CreateProductGroupDto } from './create-product-group.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductGroupDto extends PartialType(CreateProductGroupDto) {
  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
