import { Controller, Get, Post, Body, Put, Param, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProductGroupsService } from './product-groups.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';

@ApiTags('product-groups')
@Controller('product-groups')
export class ProductGroupsController {
  constructor(private readonly productGroupsService: ProductGroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create product group' })
  @ApiResponse({ status: 201, description: 'Product group created successfully' })
  create(@Body() createDto: CreateProductGroupDto) {
    return this.productGroupsService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all product groups' })
  @ApiResponse({ status: 200, description: 'Return all product groups' })
  findAll() {
    return this.productGroupsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product group by id' })
  @ApiResponse({ status: 200, description: 'Return product group' })
  findOne(@Param('id') id: string) {
    return this.productGroupsService.findOne(+id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update product group' })
  @ApiResponse({ status: 200, description: 'Product group updated successfully' })
  update(@Param('id') id: string, @Body() updateDto: UpdateProductGroupDto) {
    return this.productGroupsService.update(+id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete product group' })
  @ApiResponse({ status: 204, description: 'Product group soft deleted' })
  remove(@Param('id') id: string) {
    return this.productGroupsService.remove(+id);
  }

  // === Sales Specializations ===

  @Get(':id/sales')
  @ApiOperation({ summary: 'Get sales employees specialized in this product group' })
  @ApiResponse({ status: 200, description: 'Return sales specializations' })
  getSalesSpecializations(@Param('id') id: string) {
    return this.productGroupsService.getSalesSpecializations(+id);
  }

  @Post(':id/sales')
  @ApiOperation({ summary: 'Assign sales employee to product group' })
  @ApiResponse({ status: 201, description: 'Sales employee assigned successfully' })
  assignSales(
    @Param('id') id: string,
    @Body() body: { sales_employee_id: number; is_primary?: boolean },
  ) {
    return this.productGroupsService.assignSales(+id, body.sales_employee_id, body.is_primary);
  }

  @Delete(':id/sales/:salesId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove sales specialization' })
  @ApiResponse({ status: 204, description: 'Specialization removed successfully' })
  removeSalesSpecialization(@Param('id') id: string, @Param('salesId') salesId: string) {
    return this.productGroupsService.removeSalesSpecialization(+id, +salesId);
  }
}
