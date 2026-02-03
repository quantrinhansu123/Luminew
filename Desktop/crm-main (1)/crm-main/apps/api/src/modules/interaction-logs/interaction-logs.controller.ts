import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InteractionLogsService } from './interaction-logs.service';
import { CreateInteractionLogDto } from './dto/create-interaction-log.dto';

@ApiTags('interaction-logs')
@Controller('interaction-logs')
export class InteractionLogsController {
  constructor(private readonly interactionLogsService: InteractionLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all interaction logs' })
  @ApiQuery({ name: 'lead_id', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Return all interaction logs' })
  async findAll(@Query('lead_id') leadId?: string) {
    return this.interactionLogsService.findAll(
      leadId ? parseInt(leadId, 10) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get interaction log by ID' })
  @ApiResponse({ status: 200, description: 'Return interaction log' })
  @ApiResponse({ status: 404, description: 'Interaction log not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.interactionLogsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new interaction log' })
  @ApiResponse({ status: 201, description: 'Interaction log created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(@Body() createInteractionLogDto: CreateInteractionLogDto) {
    return this.interactionLogsService.create(createInteractionLogDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete interaction log' })
  @ApiResponse({ status: 204, description: 'Interaction log deleted successfully' })
  @ApiResponse({ status: 404, description: 'Interaction log not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.interactionLogsService.remove(id);
  }
}
