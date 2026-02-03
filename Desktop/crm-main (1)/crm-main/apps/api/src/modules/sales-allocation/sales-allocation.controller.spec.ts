import { Test, TestingModule } from '@nestjs/testing';
import { SalesAllocationController } from './sales-allocation.controller';

describe('SalesAllocationController', () => {
  let controller: SalesAllocationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesAllocationController],
    }).compile();

    controller = module.get<SalesAllocationController>(SalesAllocationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
