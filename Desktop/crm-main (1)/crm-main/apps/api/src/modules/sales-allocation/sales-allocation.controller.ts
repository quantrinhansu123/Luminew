import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SalesAllocationService } from './sales-allocation.service';
import { CreateSalesAllocationDto, UpdateSalesAllocationDto } from './dto/sales-allocation.dto';

@ApiTags('sales-allocation')
@Controller('sales-allocation')
export class SalesAllocationController {
  constructor(private readonly salesAllocationService: SalesAllocationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all sales allocation rules' })
  @ApiResponse({ status: 200, description: 'Returns all sales allocation rules' })
  findAll(@Query('is_active') isActive?: string) {
    const active = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.salesAllocationService.findAll(active);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single sales allocation rule by ID' })
  @ApiResponse({ status: 200, description: 'Returns a sales allocation rule' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesAllocationService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new sales allocation rule' })
  @ApiResponse({ status: 201, description: 'Sales allocation rule created successfully' })
  create(@Body() createDto: CreateSalesAllocationDto) {
    return this.salesAllocationService.create(createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a sales allocation rule' })
  @ApiResponse({ status: 200, description: 'Sales allocation rule updated successfully' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateDto: UpdateSalesAllocationDto) {
    return this.salesAllocationService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete (soft delete) a sales allocation rule' })
  @ApiResponse({ status: 200, description: 'Sales allocation rule deleted successfully' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.salesAllocationService.remove(id);
  }

  @Post('auto-distribute')
  @ApiOperation({ summary: 'Auto-distribute unassigned leads to sales employees' })
  @ApiResponse({ status: 200, description: 'Auto-distribution completed' })
  autoDistribute() {
    return this.salesAllocationService.autoDistribute();
  }
}
