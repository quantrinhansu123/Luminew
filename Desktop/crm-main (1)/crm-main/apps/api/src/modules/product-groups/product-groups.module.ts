import { Module } from '@nestjs/common';
import { ProductGroupsService } from './product-groups.service';
import { ProductGroupsController } from './product-groups.controller';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [ProductGroupsController],
  providers: [ProductGroupsService, PrismaService],
  exports: [ProductGroupsService],
})
export class ProductGroupsModule {}
