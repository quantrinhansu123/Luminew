import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DesignOrdersService } from './design-orders.service';
import { CreateDesignOrderDto, UpdateDesignOrderDto } from './dto/design-order.dto';
import { SupabaseStorageService } from '../../common/supabase-storage.service';

@Controller('design-orders')
export class DesignOrdersController {
  constructor(
    private readonly designOrdersService: DesignOrdersService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  @Get()
  findAll() {
    return this.designOrdersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.designOrdersService.findOne(id);
  }

  @Post()
  create(@Body() createDto: CreateDesignOrderDto) {
    return this.designOrdersService.create(createDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateDesignOrderDto) {
    return this.designOrdersService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.designOrdersService.remove(id);
  }

  @Post(':id/upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Array<{ fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; buffer: Buffer }>,
  ) {
    const uploadedFiles = await this.storageService.uploadMultipleFiles(
      files,
      `design-orders/${id}`,
    );

    // Get current order and append new files
    const order = await this.designOrdersService.findOne(id);
    const existingFiles = (order?.fileUrls as any[]) || [];
    const allFiles = [...existingFiles, ...uploadedFiles];

    // Update order with new file list
    await this.designOrdersService.update(id, { fileUrls: allFiles });

    return { files: uploadedFiles, totalFiles: allFiles.length };
  }

  @Delete(':id/files/:fileName')
  async deleteFile(
    @Param('id') id: string,
    @Param('fileName') fileName: string,
  ) {
    // Delete from storage
    await this.storageService.deleteFile(decodeURIComponent(fileName));

    // Remove from order
    const order = await this.designOrdersService.findOne(id);
    const existingFiles = (order?.fileUrls as any[]) || [];
    const updatedFiles = existingFiles.filter(
      (f) => f.fileName !== decodeURIComponent(fileName),
    );

    await this.designOrdersService.update(id, { fileUrls: updatedFiles });

    return { success: true, remainingFiles: updatedFiles.length };
  }
}
