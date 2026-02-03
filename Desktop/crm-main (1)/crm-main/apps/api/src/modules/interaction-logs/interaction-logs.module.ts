import { Module } from '@nestjs/common';
import { InteractionLogsController } from './interaction-logs.controller';
import { InteractionLogsService } from './interaction-logs.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [InteractionLogsController],
  providers: [InteractionLogsService, PrismaService],
  exports: [InteractionLogsService],
})
export class InteractionLogsModule {}
