import { Module } from '@nestjs/common';
import { SalesAllocationService } from './sales-allocation.service';
import { SalesAllocationController } from './sales-allocation.controller';

@Module({
  providers: [SalesAllocationService],
  controllers: [SalesAllocationController],
  exports: [SalesAllocationService],
})
export class SalesAllocationModule {}
