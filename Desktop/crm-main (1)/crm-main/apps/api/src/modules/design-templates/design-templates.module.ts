import { Module } from '@nestjs/common';
import { DesignTemplatesController } from './design-templates.controller';
import { DesignTemplatesService } from './design-templates.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../common/supabase-storage.service';

@Module({
  controllers: [DesignTemplatesController],
  providers: [DesignTemplatesService, PrismaService, SupabaseStorageService],
  exports: [DesignTemplatesService],
})
export class DesignTemplatesModule {}
