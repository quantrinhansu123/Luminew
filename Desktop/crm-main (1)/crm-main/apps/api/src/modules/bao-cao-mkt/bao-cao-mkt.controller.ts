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
import { BaoCaoMktService } from './bao-cao-mkt.service';
import { CreateBaoCaoMktDto, UpdateBaoCaoMktDto } from './dto/bao-cao-mkt.dto';

@ApiTags('bao-cao-mkt')
@Controller('bao-cao-mkt')
export class BaoCaoMktController {
  constructor(private readonly baoCaoMktService: BaoCaoMktService) {}

  @Get()
  @ApiOperation({ summary: 'Get all báo cáo MKT' })
  @ApiResponse({ status: 200, description: 'Return all báo cáo MKT' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.baoCaoMktService.findAll({
      search,
      page,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get báo cáo MKT by id' })
  @ApiResponse({ status: 200, description: 'Return báo cáo MKT' })
  @ApiResponse({ status: 404, description: 'Báo cáo MKT not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.baoCaoMktService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create báo cáo MKT' })
  @ApiResponse({ status: 201, description: 'Báo cáo MKT created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createDto: CreateBaoCaoMktDto) {
    return this.baoCaoMktService.create(createDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update báo cáo MKT' })
  @ApiResponse({ status: 200, description: 'Báo cáo MKT updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Báo cáo MKT not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateBaoCaoMktDto,
  ) {
    return this.baoCaoMktService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete báo cáo MKT' })
  @ApiResponse({ status: 204, description: 'Báo cáo MKT deleted' })
  @ApiResponse({ status: 404, description: 'Báo cáo MKT not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.baoCaoMktService.remove(id);
  }
}
