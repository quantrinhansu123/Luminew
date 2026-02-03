import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { lead_status } from '@prisma/client';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all leads with filters' })
  @ApiQuery({ name: 'status', required: false, enum: lead_status })
  @ApiQuery({ name: 'source_id', required: false, type: Number })
  @ApiQuery({ name: 'assigned_sales_id', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Return all leads' })
  async findAll(
    @Query('status') status?: lead_status,
    @Query('source_id') sourceId?: string,
    @Query('assigned_sales_id') assignedSalesId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.leadsService.findAll({
      status,
      source_id: sourceId ? parseInt(sourceId, 10) : undefined,
      assigned_sales_id: assignedSalesId ? parseInt(assignedSalesId, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by ID' })
  @ApiResponse({ status: 200, description: 'Return lead' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const lead = await this.leadsService.findOne(id);
    if (!lead) {
      throw new NotFoundException('Lead not found');
    }
    return lead;
  }

  @Post()
  @ApiOperation({ summary: 'Create new lead (manual entry)' })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.create(createLeadDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update lead' })
  @ApiResponse({ status: 200, description: 'Lead updated successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateLeadDto: UpdateLeadDto,
  ) {
    return this.leadsService.update(id, updateLeadDto);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert lead to customer' })
  @ApiResponse({ status: 200, description: 'Lead converted successfully' })
  @ApiResponse({ status: 400, description: 'Conversion failed' })
  async convert(@Param('id', ParseIntPipe) id: number) {
    return this.leadsService.convertToCustomer(id);
  }

  @Post(':id/convert-with-order')
  @ApiOperation({
    summary: 'Convert closed lead to customer + order with file uploads',
  })
  @ApiResponse({
    status: 201,
    description: 'Customer and order created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Lead not closed or already converted',
  })
  async convertWithOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConvertLeadDto,
  ) {
    return this.leadsService.convertWithOrder(id, dto);
  }

  @Post(':id/create-order')
  @ApiOperation({ summary: 'Create order from lead' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Order creation failed' })
  async createOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    orderData: {
      description: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      totalAmount: number;
      finalAmount: number;
    },
  ) {
    return this.leadsService.createOrderFromLead(id, orderData);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete lead' })
  @ApiResponse({ status: 204, description: 'Lead deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.leadsService.remove(id);
  }
}
