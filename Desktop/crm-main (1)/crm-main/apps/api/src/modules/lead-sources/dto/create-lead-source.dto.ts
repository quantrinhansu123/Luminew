import { source_type } from '@prisma/client';
import { IsEnum, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLeadSourceDto {
  @ApiProperty({ enum: source_type })
  @IsEnum(source_type)
  type: source_type;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  api_key?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  webhook_url?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
