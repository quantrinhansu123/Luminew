import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional } from 'class-validator';
import { DesignOrderStatus } from './design-orders.entity';

export class CreateDesignOrderDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  productType: string;

  @IsString()
  @IsNotEmpty()
  requirements: string;

  @IsNumber()
  revenue: number;

  @IsString()
  @IsNotEmpty()
  deadline: string;

  @IsString()
  @IsOptional()
  designer?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}

export class UpdateDesignOrderDto {
  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  productType?: string;

  @IsString()
  @IsOptional()
  requirements?: string;

  @IsString()
  @IsOptional()
  designer?: string;

  @IsEnum(DesignOrderStatus)
  @IsOptional()
  status?: DesignOrderStatus;

  @IsNumber()
  @IsOptional()
  revenue?: number;

  @IsString()
  @IsOptional()
  deadline?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;
}
