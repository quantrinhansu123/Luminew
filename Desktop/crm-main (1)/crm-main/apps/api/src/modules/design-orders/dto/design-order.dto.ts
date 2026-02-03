import { IsString, IsNumber, IsEnum, IsDateString, IsOptional, IsArray } from 'class-validator';

export enum DesignOrderStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreateDesignOrderDto {
  @IsString()
  customerName: string;

  @IsString()
  phone: string;

  @IsString()
  productType: string;

  @IsString()
  requirements: string;

  @IsNumber()
  revenue: number;

  @IsDateString()
  deadline: string;

  @IsOptional()
  @IsString()
  designer?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  fileUrls?: any[];
}

export class UpdateDesignOrderDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @IsString()
  requirements?: string;

  @IsOptional()
  @IsString()
  designer?: string;

  @IsOptional()
  @IsEnum(DesignOrderStatus)
  status?: DesignOrderStatus;

  @IsOptional()
  @IsNumber()
  revenue?: number;

  @IsOptional()
  @IsDateString()
  deadline?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  fileUrls?: any[];
}
