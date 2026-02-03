import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';

@Injectable()
export class ProductGroupsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreateProductGroupDto) {
    return this.prisma.product_groups.create({
      data: {
        name: createDto.name,
        code: createDto.code,
        description: createDto.description,
        is_active: true,
      },
    });
  }

  async findAll() {
    return this.prisma.product_groups.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(id: number) {
    return this.prisma.product_groups.findUnique({
      where: { id },
    });
  }

  async update(id: number, updateDto: UpdateProductGroupDto) {
    return this.prisma.product_groups.update({
      where: { id },
      data: updateDto,
    });
  }

  async remove(id: number) {
    // Soft delete
    return this.prisma.product_groups.update({
      where: { id },
      data: {
        is_active: false,
      },
    });
  }

  // Get sales employees specialized in this product group
  async getSalesSpecializations(productGroupId: number) {
    return this.prisma.sales_product_specializations.findMany({
      where: {
        product_group_id: productGroupId,
      },
      include: {
        sales_employees: true,
      },
    });
  }

  // Assign sales employee to product group
  async assignSales(productGroupId: number, salesEmployeeId: number, isPrimary: boolean = false) {
    return this.prisma.sales_product_specializations.create({
      data: {
        product_group_id: productGroupId,
        sales_employee_id: salesEmployeeId,
        is_primary: isPrimary,
      },
    });
  }

  // Remove sales specialization
  async removeSalesSpecialization(productGroupId: number, salesEmployeeId: number) {
    return this.prisma.sales_product_specializations.deleteMany({
      where: {
        product_group_id: productGroupId,
        sales_employee_id: salesEmployeeId,
      },
    });
  }
}
