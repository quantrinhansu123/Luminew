import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesEmployeeDto, UpdateSalesEmployeeDto } from './dto/sales-employee.dto';

@Injectable()
export class SalesEmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { is_active: isActive } : {};

    return this.prisma.sales_employees.findMany({
      where,
      orderBy: {
        round_robin_order: 'asc',
      },
    });
  }

  async findOne(id: number) {
    return this.prisma.sales_employees.findUnique({
      where: { id },
    });
  }

  async create(createDto: CreateSalesEmployeeDto) {
    // Get next round_robin_order
    const maxOrderEmployee = await this.prisma.sales_employees.findFirst({
      orderBy: {
        round_robin_order: 'desc',
      },
      select: {
        round_robin_order: true,
      },
    });

    const nextOrder = (maxOrderEmployee?.round_robin_order || 0) + 1;

    return this.prisma.sales_employees.create({
      data: {
        employee_code: createDto.employee_code,
        full_name: createDto.full_name,
        email: createDto.email,
        phone: createDto.phone,
        user_id: createDto.user_id,
        round_robin_order: nextOrder,
        is_active: true,
        daily_lead_count: 0,
        total_lead_count: 0,
      },
    });
  }

  async update(id: number, updateDto: UpdateSalesEmployeeDto) {
    return this.prisma.sales_employees.update({
      where: { id },
      data: updateDto,
    });
  }

  async reorder(id: number, newOrder: number) {
    return this.prisma.sales_employees.update({
      where: { id },
      data: {
        round_robin_order: newOrder,
      },
    });
  }

  async softDelete(id: number) {
    return this.prisma.sales_employees.update({
      where: { id },
      data: {
        is_active: false,
      },
    });
  }

  async resetDailyCounts() {
    return this.prisma.sales_employees.updateMany({
      data: {
        daily_lead_count: 0,
      },
    });
  }

  // Specializations methods
  async getSpecializations(salesEmployeeId: number) {
    return this.prisma.sales_product_specializations.findMany({
      where: {
        sales_employee_id: salesEmployeeId,
      },
      include: {
        product_groups: true,
      },
      orderBy: {
        is_primary: 'desc',
      },
    });
  }

  async addSpecialization(
    salesEmployeeId: number,
    productGroupId: number,
    isPrimary?: boolean
  ) {
    // Check if specialization already exists
    const existing = await this.prisma.sales_product_specializations.findUnique({
      where: {
        sales_employee_id_product_group_id: {
          sales_employee_id: salesEmployeeId,
          product_group_id: productGroupId,
        },
      },
    });

    if (existing) {
      // Update if exists
      return this.prisma.sales_product_specializations.update({
        where: {
          id: existing.id,
        },
        data: {
          is_primary: isPrimary ?? existing.is_primary,
        },
      });
    }

    // Create new specialization
    return this.prisma.sales_product_specializations.create({
      data: {
        sales_employee_id: salesEmployeeId,
        product_group_id: productGroupId,
        is_primary: isPrimary ?? false,
      },
    });
  }

  async removeSpecialization(salesEmployeeId: number, productGroupId: number) {
    return this.prisma.sales_product_specializations.deleteMany({
      where: {
        sales_employee_id: salesEmployeeId,
        product_group_id: productGroupId,
      },
    });
  }

  async getSalesByProductGroup(productGroupId: number) {
    const specializations = await this.prisma.sales_product_specializations.findMany({
      where: {
        product_group_id: productGroupId,
      },
      include: {
        sales_employees: true,
      },
    });

    return specializations
      .filter((spec) => spec.sales_employees.is_active)
      .map((spec) => spec.sales_employees);
  }
}
