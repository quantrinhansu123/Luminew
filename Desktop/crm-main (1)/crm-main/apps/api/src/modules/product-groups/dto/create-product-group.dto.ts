import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductGroupDto {
  @ApiProperty({ example: 'Hộp giấy' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'BOX' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ example: 'Các sản phẩm hộp giấy, bao bì carton' })
  @IsString()
  @IsOptional()
  description?: string;
}
