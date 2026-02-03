import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalesEmployeesService } from './sales-employees.service';
import { CreateSalesEmployeeDto, UpdateSalesEmployeeDto, ReorderSalesEmployeeDto } from './dto/sales-employee.dto';

@ApiTags('sales-employees')
@Controller('sales-employees')
export class SalesEmployeesController {
  constructor(private readonly salesEmployeesService: SalesEmployeesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all sales employees' })
  @ApiResponse({ status: 200, description: 'Return all sales employees' })
  async findAll(@Query('is_active') isActive?: string) {
    const isActiveBool = isActive !== undefined ? isActive === 'true' : undefined;
    return this.salesEmployeesService.findAll(isActiveBool);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sales employee by id' })
  @ApiResponse({ status: 200, description: 'Return sales employee' })
  @ApiResponse({ status: 404, description: 'Sales employee not found' })
  async findOne(@Param('id') id: string) {
    return this.salesEmployeesService.findOne(Number(id));
  }

  @Post()
  @ApiOperation({ summary: 'Create sales employee' })
  @ApiResponse({ status: 201, description: 'Sales employee created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateSalesEmployeeDto) {
    return this.salesEmployeesService.create(createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update sales employee' })
  @ApiResponse({ status: 200, description: 'Sales employee updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateSalesEmployeeDto) {
    return this.salesEmployeesService.update(Number(id), updateDto);
  }

  @Put(':id/reorder')
  @ApiOperation({ summary: 'Update round-robin order' })
  @ApiResponse({ status: 200, description: 'Round-robin order updated successfully' })
  async reorder(@Param('id') id: string, @Body() reorderDto: ReorderSalesEmployeeDto) {
    return this.salesEmployeesService.reorder(Number(id), reorderDto.new_order);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete sales employee' })
  @ApiResponse({ status: 204, description: 'Sales employee soft deleted' })
  async remove(@Param('id') id: string) {
    return this.salesEmployeesService.softDelete(Number(id));
  }

  @Post('reset-daily')
  @ApiOperation({ summary: 'Reset daily lead counts for all sales employees' })
  @ApiResponse({ status: 200, description: 'Daily counts reset successfully' })
  async resetDailyCounts() {
    await this.salesEmployeesService.resetDailyCounts();
    return { message: 'Daily counts reset' };
  }

  // Specializations endpoints
  @Get(':id/specializations')
  @ApiOperation({ summary: 'Get specializations for a sales employee' })
  @ApiResponse({ status: 200, description: 'Return specializations' })
  async getSpecializations(@Param('id') id: string) {
    return this.salesEmployeesService.getSpecializations(Number(id));
  }

  @Post(':id/specializations')
  @ApiOperation({ summary: 'Add specialization to sales employee' })
  @ApiResponse({ status: 201, description: 'Specialization added successfully' })
  async addSpecialization(
    @Param('id') id: string,
    @Body() body: { product_group_id: number; is_primary?: boolean }
  ) {
    return this.salesEmployeesService.addSpecialization(
      Number(id),
      body.product_group_id,
      body.is_primary
    );
  }

  @Delete(':id/specializations/:productGroupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove specialization from sales employee' })
  @ApiResponse({ status: 204, description: 'Specialization removed successfully' })
  async removeSpecialization(
    @Param('id') id: string,
    @Param('productGroupId') productGroupId: string
  ) {
    await this.salesEmployeesService.removeSpecialization(
      Number(id),
      Number(productGroupId)
    );
  }

  @Get('by-product-group/:productGroupId')
  @ApiOperation({ summary: 'Get sales employees specialized in a product group' })
  @ApiResponse({ status: 200, description: 'Return sales employees' })
  async getSalesByProductGroup(@Param('productGroupId') productGroupId: string) {
    return this.salesEmployeesService.getSalesByProductGroup(Number(productGroupId));
  }
}
