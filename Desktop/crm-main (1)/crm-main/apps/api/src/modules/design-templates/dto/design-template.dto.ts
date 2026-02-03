import { IsString, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';

export class CreateDesignTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  type: string; // bag, box, card, label

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  fileUrls?: any[];

  @IsOptional()
  dimensions?: { width?: number; height?: number; depth?: number; gusset?: number };

  @IsOptional()
  @IsInt()
  paperWeight?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  sourceOrderId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateDesignTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  fileUrls?: any[];

  @IsOptional()
  dimensions?: { width?: number; height?: number; depth?: number; gusset?: number };

  @IsOptional()
  @IsInt()
  paperWeight?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsInt()
  usageCount?: number;
}
