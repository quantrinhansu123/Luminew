import { Test, TestingModule } from '@nestjs/testing';
import { SalesEmployeesService } from './sales-employees.service';

describe('SalesEmployeesService', () => {
  let service: SalesEmployeesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesEmployeesService],
    }).compile();

    service = module.get<SalesEmployeesService>(SalesEmployeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
