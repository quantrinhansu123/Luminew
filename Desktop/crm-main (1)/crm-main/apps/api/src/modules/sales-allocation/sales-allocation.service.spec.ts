import { Test, TestingModule } from '@nestjs/testing';
import { SalesAllocationService } from './sales-allocation.service';

describe('SalesAllocationService', () => {
  let service: SalesAllocationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesAllocationService],
    }).compile();

    service = module.get<SalesAllocationService>(SalesAllocationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
