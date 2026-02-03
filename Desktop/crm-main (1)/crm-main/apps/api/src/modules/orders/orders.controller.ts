import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto, AddPaymentDto, AddDesignResultDto } from './dto/order.dto';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all orders with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'salesEmployeeId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('salesEmployeeId') salesEmployeeId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.ordersService.findAll({
      status,
      salesEmployeeId: salesEmployeeId ? parseInt(salesEmployeeId) : undefined,
      customerId: customerId ? parseInt(customerId) : undefined,
    });
  }

  // Static routes MUST come before :id routes
  @Get('design/needs-work')
  @ApiOperation({ summary: 'Get orders that need design work' })
  findOrdersNeedingDesign() {
    return this.ordersService.findOrdersNeedingDesign();
  }

  @Get('design/gallery')
  @ApiOperation({ summary: 'Get gallery data for design library' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  getGalleryData(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.ordersService.getGalleryData({
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/files')
  @ApiOperation({ summary: 'Get order with all design files' })
  findOneWithFiles(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.findOneWithFiles(id);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'Get payment history for order' })
  getPayments(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getPayments(id);
  }

  @Get(':id/allowed-transitions')
  @ApiOperation({ summary: 'Get allowed status transitions for order' })
  async getAllowedTransitions(@Param('id', ParseIntPipe) id: number) {
    const order = await this.ordersService.findOne(id);
    const allowedTransitions = this.ordersService.getAllowedTransitions(order.status);
    return {
      currentStatus: order.status,
      allowedTransitions,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new order' })
  create(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.create(createOrderDto);
  }

  @Post(':id/payment')
  @ApiOperation({ summary: 'Add payment to order' })
  addPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() addPaymentDto: AddPaymentDto,
  ) {
    return this.ordersService.addPayment(id, addPaymentDto);
  }

  @Post(':id/design-results')
  @ApiOperation({ summary: 'Add design result file to order' })
  addDesignResult(
    @Param('id', ParseIntPipe) id: number,
    @Body() fileData: AddDesignResultDto,
  ) {
    return this.ordersService.addDesignResult(id, fileData);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an order' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an order' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.delete(id);
  }

  @Delete(':id/files/:fileId')
  @ApiOperation({ summary: 'Delete design file from order' })
  deleteDesignFile(
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    return this.ordersService.deleteDesignFile(id, fileId);
  }
}
