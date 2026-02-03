import { Module } from '@nestjs/common';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadSourcesService } from './lead-sources.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [LeadSourcesController],
  providers: [LeadSourcesService, PrismaService],
  exports: [LeadSourcesService],
})
export class LeadSourcesModule {}
