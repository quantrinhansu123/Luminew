import { Module } from '@nestjs/common';
import { BaoCaoMktController } from './bao-cao-mkt.controller';
import { BaoCaoMktService } from './bao-cao-mkt.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [BaoCaoMktController],
  providers: [BaoCaoMktService, PrismaService],
  exports: [BaoCaoMktService],
})
export class BaoCaoMktModule {}
