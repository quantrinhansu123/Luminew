import { Module } from '@nestjs/common';
import { SalesEmployeesController } from './sales-employees.controller';
import { SalesEmployeesService } from './sales-employees.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [SalesEmployeesController],
  providers: [SalesEmployeesService, PrismaService],
  exports: [SalesEmployeesService],
})
export class SalesEmployeesModule {}
