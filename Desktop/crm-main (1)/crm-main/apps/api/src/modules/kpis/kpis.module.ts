import { Module } from '@nestjs/common';
import { KpisController } from './kpis.controller';
import { KpisService } from './kpis.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [KpisController],
  providers: [KpisService, PrismaService],
  exports: [KpisService],
})
export class KpisModule {}
