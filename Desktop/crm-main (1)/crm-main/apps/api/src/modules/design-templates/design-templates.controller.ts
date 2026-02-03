import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DesignTemplatesService } from './design-templates.service';
import { CreateDesignTemplateDto, UpdateDesignTemplateDto } from './dto/design-template.dto';
import { SupabaseStorageService } from '../../common/supabase-storage.service';

@Controller('design-templates')
export class DesignTemplatesController {
  constructor(
    private readonly service: DesignTemplatesService,
    private readonly storageService: SupabaseStorageService,
  ) {}

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAll({ type, category, search });
  }

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() createDto: CreateDesignTemplateDto) {
    return this.service.create(createDto);
  }

  @Post('from-order/:orderId')
  createFromOrder(
    @Param('orderId') orderId: string,
    @Body() templateData: Partial<CreateDesignTemplateDto>,
  ) {
    return this.service.createFromDesignOrder(orderId, templateData);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateDesignTemplateDto) {
    return this.service.update(id, updateDto);
  }

  @Patch(':id/increment-usage')
  incrementUsage(@Param('id') id: string) {
    return this.service.incrementUsage(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadFiles(
    @Param('id') id: string,
    @UploadedFiles() files: Array<{ fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; buffer: Buffer }>,
  ) {
    const uploadedFiles = await this.storageService.uploadMultipleFiles(
      files,
      `design-templates/${id}`,
    );

    // Get current template and append new files
    const template = await this.service.findOne(id);
    const existingFiles = (template?.fileUrls as any[]) || [];
    const allFiles = [...existingFiles, ...uploadedFiles];

    // Set first file as thumbnail if none exists
    const thumbnailUrl = template?.thumbnailUrl || uploadedFiles[0]?.url;

    // Update template with new file list
    await this.service.update(id, {
      fileUrls: allFiles,
      thumbnailUrl,
    });

    return { files: uploadedFiles, totalFiles: allFiles.length };
  }

  @Delete(':id/files/:fileName')
  async deleteFile(
    @Param('id') id: string,
    @Param('fileName') fileName: string,
  ) {
    // Delete from storage
    await this.storageService.deleteFile(decodeURIComponent(fileName));

    // Remove from template
    const template = await this.service.findOne(id);
    const existingFiles = (template?.fileUrls as any[]) || [];
    const updatedFiles = existingFiles.filter(
      (f) => f.fileName !== decodeURIComponent(fileName),
    );

    await this.service.update(id, { fileUrls: updatedFiles });

    return { success: true, remainingFiles: updatedFiles.length };
  }
}
