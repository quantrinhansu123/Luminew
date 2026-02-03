import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    search?: string;
    account_manager_id?: number;
    limit?: number;
    offset?: number;
  }) {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { full_name: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
        { customer_code: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters?.account_manager_id) {
      where.account_manager_id = filters.account_manager_id;
    }

    const [data, count] = await Promise.all([
      this.prisma.customers.findMany({
        where,
        include: {
          sales_employees: {
            select: {
              full_name: true,
              employee_code: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.customers.count({ where }),
    ]);

    return { data, count };
  }

  async findOne(id: number) {
    const customer = await this.prisma.customers.findUnique({
      where: { id },
      include: {
        sales_employees: {
          select: {
            id: true,
            full_name: true,
            employee_code: true,
          },
        },
        orders: {
          select: {
            id: true,
            order_code: true,
            total_amount: true,
            final_amount: true,
            status: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
          take: 10,
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async create(createDto: CreateCustomerDto) {
    // Check if phone already exists
    const existing = await this.prisma.customers.findFirst({
      where: { phone: createDto.phone },
    });

    if (existing) {
      throw new BadRequestException('Số điện thoại đã tồn tại trong hệ thống');
    }

    // Generate customer code
    const customerCode = `KH${Date.now().toString().slice(-8)}`;

    return this.prisma.customers.create({
      data: {
        customer_code: customerCode,
        full_name: createDto.full_name,
        phone: createDto.phone,
        email: createDto.email,
        address: createDto.address,
        tax_code: createDto.tax_code,
        company_name: createDto.company_name,
        account_manager_id: createDto.account_manager_id,
      },
      include: {
        sales_employees: {
          select: {
            full_name: true,
            employee_code: true,
          },
        },
      },
    });
  }

  async update(id: number, updateDto: UpdateCustomerDto) {
    // Check if customer exists
    const customer = await this.prisma.customers.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // If phone is being updated, check for duplicates
    if (updateDto.phone && updateDto.phone !== customer.phone) {
      const existing = await this.prisma.customers.findFirst({
        where: { phone: updateDto.phone, id: { not: id } },
      });

      if (existing) {
        throw new BadRequestException('Số điện thoại đã tồn tại trong hệ thống');
      }
    }

    return this.prisma.customers.update({
      where: { id },
      data: updateDto,
      include: {
        sales_employees: {
          select: {
            full_name: true,
            employee_code: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    // Check if customer exists
    const customer = await this.prisma.customers.findUnique({
      where: { id },
      include: {
        orders: { select: { id: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Check if customer has orders
    if (customer.orders.length > 0) {
      throw new BadRequestException(
        'Không thể xóa khách hàng đã có đơn hàng. Vui lòng xóa các đơn hàng trước.',
      );
    }

    // Delete related interaction_logs first
    await this.prisma.interaction_logs.deleteMany({
      where: { customer_id: id },
    });

    return this.prisma.customers.delete({
      where: { id },
    });
  }
}
