import { Module } from '@nestjs/common';
import { DesignOrdersController } from './design-orders.controller';
import { DesignOrdersService } from './design-orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseStorageService } from '../../common/supabase-storage.service';

@Module({
  controllers: [DesignOrdersController],
  providers: [DesignOrdersService, PrismaService, SupabaseStorageService],
  exports: [DesignOrdersService],
})
export class DesignOrdersModule {}
