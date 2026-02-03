import { IsEnum, IsString, IsInt, IsOptional, IsISO8601 } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { interaction_type } from '@prisma/client';

export class CreateInteractionLogDto {
  @ApiProperty()
  @IsInt()
  lead_id: number;

  @ApiProperty({ enum: interaction_type })
  @IsEnum(interaction_type)
  type: interaction_type;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  duration_seconds?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsISO8601()
  occurred_at?: string;
}
