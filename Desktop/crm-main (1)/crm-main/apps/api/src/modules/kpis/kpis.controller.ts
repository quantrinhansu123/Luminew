import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { KpisService } from './kpis.service';
import { CreateKpisDto, UpdateKpisDto } from './dto/kpis.dto';

@ApiTags('kpis')
@Controller('kpis')
export class KpisController {
  constructor(private readonly kpisService: KpisService) {}

  @Get()
  @ApiOperation({ summary: 'Get all KPIs' })
  @ApiResponse({ status: 200, description: 'Return all KPIs' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'bo_phan', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(
    @Query('search') search?: string,
    @Query('bo_phan') boPhan?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.kpisService.findAll({
      search,
      bo_phan: boPhan,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get KPIs by id' })
  @ApiResponse({ status: 200, description: 'Return KPIs' })
  @ApiResponse({ status: 404, description: 'KPIs not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.kpisService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create KPIs' })
  @ApiResponse({ status: 201, description: 'KPIs created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateKpisDto) {
    return this.kpisService.create(createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update KPIs' })
  @ApiResponse({ status: 200, description: 'KPIs updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'KPIs not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateKpisDto,
  ) {
    return this.kpisService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete KPIs' })
  @ApiResponse({ status: 204, description: 'KPIs deleted' })
  @ApiResponse({ status: 404, description: 'KPIs not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.kpisService.remove(id);
  }
}
