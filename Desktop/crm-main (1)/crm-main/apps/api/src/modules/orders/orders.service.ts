import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/order.dto';
import { order_status } from '@prisma/client';

// Define valid status transitions
const STATUS_TRANSITIONS: Record<order_status, order_status[]> = {
  pending: ['designing', 'cancelled'],
  designing: ['approved', 'pending', 'cancelled'],
  approved: ['printing', 'designing', 'cancelled'],
  printing: ['completed', 'approved', 'cancelled'],
  completed: ['delivered', 'printing'],
  delivered: [], // Final state, no transitions allowed
  cancelled: ['pending'], // Can reopen cancelled orders
};

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  // Validate status transition
  private validateStatusTransition(currentStatus: order_status, newStatus: order_status): void {
    if (currentStatus === newStatus) {
      return; // Same status, no change needed
    }

    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      const statusLabels: Record<order_status, string> = {
        pending: 'Chờ xử lý',
        designing: 'Đang thiết kế',
        approved: 'Đã duyệt',
        printing: 'Đang in',
        completed: 'Hoàn thành',
        delivered: 'Đã giao',
        cancelled: 'Đã hủy',
      };
      throw new BadRequestException(
        `Không thể chuyển từ "${statusLabels[currentStatus]}" sang "${statusLabels[newStatus]}". ` +
        `Các trạng thái hợp lệ: ${allowedTransitions.map(s => statusLabels[s]).join(', ') || 'Không có'}`
      );
    }
  }

  async findAll(filters?: {
    status?: string;
    salesEmployeeId?: number;
    customerId?: number;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.salesEmployeeId) {
      where.sales_employee_id = filters.salesEmployeeId;
    }
    if (filters?.customerId) {
      where.customer_id = filters.customerId;
    }

    return this.prisma.orders.findMany({
      where,
      include: {
        customers: true,
        sales_employees: true,
        product_groups: true,
        payments: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        customers: true,
        sales_employees: true,
        product_groups: true,
        payments: true,
        design_files: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async create(data: CreateOrderDto) {
    const orderCode = `ORD${Date.now().toString().slice(-8)}`;

    return this.prisma.orders.create({
      data: {
        order_code: orderCode,
        customer_id: data.customerId,
        product_group_id: data.productGroupId,
        description: data.description,
        quantity: data.quantity,
        unit: data.unit,
        specifications: data.specifications,
        unit_price: data.unitPrice,
        total_amount: data.totalAmount,
        discount: data.discount || 0,
        tax_amount: data.taxAmount || 0,
        final_amount: data.finalAmount,
        status: 'pending',
        sales_employee_id: data.salesEmployeeId,
        expected_delivery: data.expectedDelivery ? new Date(data.expectedDelivery) : null,
      },
      include: {
        customers: true,
        sales_employees: true,
        product_groups: true,
      },
    });
  }

  async update(id: number, data: UpdateOrderDto) {
    const order = await this.findOne(id);

    // Validate status transition if status is being changed
    if (data.status && data.status !== order.status) {
      this.validateStatusTransition(order.status, data.status as order_status);
    }

    return this.prisma.orders.update({
      where: { id },
      data: {
        description: data.description,
        quantity: data.quantity,
        unit: data.unit,
        specifications: data.specifications,
        unit_price: data.unitPrice,
        total_amount: data.totalAmount,
        discount: data.discount,
        tax_amount: data.taxAmount,
        final_amount: data.finalAmount,
        status: data.status as order_status,
        expected_delivery: data.expectedDelivery ? new Date(data.expectedDelivery) : undefined,
        actual_delivery: data.actualDelivery ? new Date(data.actualDelivery) : undefined,
      },
      include: {
        customers: true,
        sales_employees: true,
        product_groups: true,
        payments: true,
      },
    });
  }

  async delete(id: number) {
    await this.findOne(id);
    return this.prisma.orders.delete({ where: { id } });
  }

  async addPayment(orderId: number, data: { amount: number; content: string; method?: string }) {
    const order = await this.findOne(orderId);
    const paymentCode = `PAY${Date.now().toString().slice(-8)}`;

    return this.prisma.payments.create({
      data: {
        payment_code: paymentCode,
        customer_id: order.customer_id,
        order_id: orderId,
        amount: data.amount,
        payment_method: data.method || 'transfer',
        notes: data.content,
        status: 'paid',
        paid_at: new Date(),
      },
    });
  }

  async getPayments(orderId: number) {
    return this.prisma.payments.findMany({
      where: { order_id: orderId },
      orderBy: { created_at: 'desc' },
    });
  }

  // Get allowed status transitions for an order
  getAllowedTransitions(currentStatus: order_status): order_status[] {
    return STATUS_TRANSITIONS[currentStatus] || [];
  }

  /**
   * Get orders that need design work (pending or designing status)
   */
  async findOrdersNeedingDesign() {
    return this.prisma.orders.findMany({
      where: {
        status: { in: ['pending', 'designing'] },
      },
      include: {
        customers: true,
        sales_employees: true,
        design_files: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Get order detail with all files (both request and result)
   */
  async findOneWithFiles(id: number) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        customers: true,
        sales_employees: true,
        product_groups: true,
        design_files: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // Separate files by category
    const requestFiles = order.design_files.filter(f => f.file_category === 'request');
    const resultFiles = order.design_files.filter(f => f.file_category === 'result');

    return {
      ...order,
      request_files: requestFiles,
      result_files: resultFiles,
    };
  }

  /**
   * Add design result file to order
   */
  async addDesignResult(orderId: number, fileData: {
    google_drive_id: string;
    file_name: string;
    file_type?: string;
    file_size_bytes?: number;
    thumbnail_url?: string;
  }) {
    const order = await this.findOne(orderId);

    return this.prisma.design_files.create({
      data: {
        customer_id: order.customer_id,
        order_id: orderId,
        file_name: fileData.file_name,
        storage_path: `gdrive://${fileData.google_drive_id}`,
        file_type: fileData.file_type,
        file_size_bytes: fileData.file_size_bytes ? BigInt(fileData.file_size_bytes) : null,
        google_drive_id: fileData.google_drive_id,
        thumbnail_url: fileData.thumbnail_url,
        file_category: 'result',
      },
    });
  }

  /**
   * Get gallery data for design library (orders with files + thumbnails)
   */
  async getGalleryData(options?: { search?: string; limit?: number; offset?: number }) {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;

    const where: any = {};

    if (options?.search) {
      where.OR = [
        { order_code: { contains: options.search, mode: 'insensitive' } },
        { customers: { full_name: { contains: options.search, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.prisma.orders.findMany({
        where,
        include: {
          customers: {
            select: { full_name: true, phone: true },
          },
          design_files: {
            where: { thumbnail_url: { not: null } },
            take: 1,
            orderBy: { created_at: 'desc' },
          },
          _count: { select: { design_files: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.orders.count({ where }),
    ]);

    return {
      orders: orders.map(order => ({
        id: order.id,
        order_code: order.order_code,
        customer_name: order.customers?.full_name,
        thumbnail_url: order.design_files[0]?.thumbnail_url || null,
        file_count: order._count.design_files,
        status: order.status,
        created_at: order.created_at,
      })),
      total,
      limit,
      offset,
    };
  }

  /**
   * Delete design file from order
   */
  async deleteDesignFile(orderId: number, fileId: number) {
    const file = await this.prisma.design_files.findFirst({
      where: { id: fileId, order_id: orderId },
    });

    if (!file) {
      throw new NotFoundException(`File not found`);
    }

    await this.prisma.design_files.delete({ where: { id: fileId } });
    return { success: true };
  }
}
