import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalesEmployeeDto {
  @ApiProperty({ example: 'NV001' })
  @IsString()
  employee_code: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  full_name: string;

  @ApiProperty({ example: 'nva@company.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: null })
  @IsString()
  @IsOptional()
  user_id?: string;
}

export class UpdateSalesEmployeeDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiPropertyOptional({ example: 'nva@company.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  round_robin_order?: number;
}

export class ReorderSalesEmployeeDto {
  @ApiProperty({ example: 2 })
  @IsNumber()
  new_order: number;
}
