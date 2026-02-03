import { Test, TestingModule } from '@nestjs/testing';
import { SalesEmployeesController } from './sales-employees.controller';

describe('SalesEmployeesController', () => {
  let controller: SalesEmployeesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalesEmployeesController],
    }).compile();

    controller = module.get<SalesEmployeesController>(SalesEmployeesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
