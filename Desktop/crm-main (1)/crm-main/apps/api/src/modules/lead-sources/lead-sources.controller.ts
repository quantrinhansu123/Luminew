import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LeadSourcesService } from './lead-sources.service';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';

@ApiTags('lead-sources')
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadSourcesService: LeadSourcesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all lead sources' })
  @ApiResponse({ status: 200, description: 'Return all lead sources' })
  async findAll() {
    return this.leadSourcesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead source by ID' })
  @ApiResponse({ status: 200, description: 'Return lead source' })
  @ApiResponse({ status: 404, description: 'Lead source not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const leadSource = await this.leadSourcesService.findOne(id);
    if (!leadSource) {
      throw new NotFoundException('Lead source not found');
    }
    return leadSource;
  }

  @Post()
  @ApiOperation({ summary: 'Create new lead source' })
  @ApiResponse({ status: 201, description: 'Lead source created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createLeadSourceDto: CreateLeadSourceDto) {
    return this.leadSourcesService.create(createLeadSourceDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update lead source' })
  @ApiResponse({ status: 200, description: 'Lead source updated successfully' })
  @ApiResponse({ status: 404, description: 'Lead source not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateLeadSourceDto: UpdateLeadSourceDto,
  ) {
    return this.leadSourcesService.update(id, updateLeadSourceDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete lead source' })
  @ApiResponse({ status: 204, description: 'Lead source deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lead source not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.leadSourcesService.remove(id);
  }
}
