import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsNumber, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty({ description: 'Full name of the customer' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  full_name: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Tax code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tax_code?: string;

  @ApiPropertyOptional({ description: 'Company name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company_name?: string;

  @ApiPropertyOptional({ description: 'Account manager ID' })
  @IsOptional()
  @IsNumber()
  account_manager_id?: number;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
