import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { lead_status } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private googleDriveService: GoogleDriveService,
  ) {}

  async findAll(filters?: {
    status?: lead_status;
    source_id?: number;
    assigned_sales_id?: number;
    limit?: number;
    offset?: number;
  }) {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.source_id) where.source_id = filters.source_id;
    if (filters?.assigned_sales_id) where.assigned_sales_id = filters.assigned_sales_id;

    const [data, count] = await Promise.all([
      this.prisma.leads.findMany({
        where,
        include: {
          lead_sources: {
            select: {
              name: true,
              type: true,
            },
          },
          campaigns: {
            select: {
              name: true,
            },
          },
          product_groups: {
            select: {
              name: true,
            },
          },
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
      this.prisma.leads.count({ where }),
    ]);

    return { data, count };
  }

  async findOne(id: number) {
    return this.prisma.leads.findUnique({
      where: { id },
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
        campaigns: {
          select: {
            name: true,
          },
        },
        product_groups: {
          select: {
            name: true,
          },
        },
        sales_employees: {
          select: {
            full_name: true,
            employee_code: true,
          },
        },
      },
    });
  }

  async create(createLeadDto: CreateLeadDto) {
    // Create lead with status 'new'
    const lead = await this.prisma.leads.create({
      data: {
        ...createLeadDto,
        status: 'new',
      },
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
        campaigns: {
          select: {
            name: true,
          },
        },
        product_groups: {
          select: {
            name: true,
          },
        },
      },
    });

    // Call auto-assign function (if exists in database)
    try {
      await this.prisma.$queryRaw`SELECT auto_assign_lead(${lead.id})`;
    } catch (error) {
      // Function might not exist yet, ignore error
      console.log('Auto-assign function not available:', error.message);
    }

    return lead;
  }

  async update(id: number, updateLeadDto: UpdateLeadDto) {
    const data: any = {};

    // Update basic fields
    if (updateLeadDto.full_name !== undefined) data.full_name = updateLeadDto.full_name;
    if (updateLeadDto.phone !== undefined) data.phone = updateLeadDto.phone;
    if (updateLeadDto.email !== undefined) data.email = updateLeadDto.email;
    if (updateLeadDto.demand !== undefined) data.demand = updateLeadDto.demand;
    if (updateLeadDto.source_id !== undefined) data.source_id = updateLeadDto.source_id;
    if (updateLeadDto.campaign_id !== undefined) data.campaign_id = updateLeadDto.campaign_id;
    if (updateLeadDto.customer_group !== undefined) data.customer_group = updateLeadDto.customer_group;
    if (updateLeadDto.interested_product_group_id !== undefined)
      data.interested_product_group_id = updateLeadDto.interested_product_group_id;
    if (updateLeadDto.status !== undefined) data.status = updateLeadDto.status;

    // Handle sales assignment
    if (updateLeadDto.assigned_sales_id !== undefined) {
      data.assigned_sales_id = updateLeadDto.assigned_sales_id;
      data.assigned_at = new Date();
      data.assignment_method = updateLeadDto.assignment_method || 'manual';
    }

    return this.prisma.leads.update({
      where: { id },
      data,
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
        campaigns: {
          select: {
            name: true,
          },
        },
        sales_employees: {
          select: {
            full_name: true,
            employee_code: true,
          },
        },
        product_groups: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  async convertToCustomer(leadId: number) {
    // Use transaction for atomicity and better performance
    return await this.prisma.$transaction(async (tx) => {
      // Get lead info
      const lead = await tx.leads.findUnique({
        where: { id: leadId },
        select: {
          id: true,
          full_name: true,
          phone: true,
          email: true,
          assigned_sales_id: true,
          is_converted: true,
        },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      if (lead.is_converted) {
        throw new Error('Lead đã được chuyển đổi trước đó');
      }

      // Check if customer with same phone already exists
      let customer = await tx.customers.findFirst({
        where: { phone: lead.phone },
        select: { id: true },
      });

      if (!customer) {
        // Create new customer
        const customerCode = `KH${Date.now().toString().slice(-8)}`;
        customer = await tx.customers.create({
          data: {
            customer_code: customerCode,
            full_name: lead.full_name,
            phone: lead.phone,
            email: lead.email,
            original_lead_id: leadId,
            account_manager_id: lead.assigned_sales_id,
          },
          select: { id: true },
        });
      }

      // Update lead as converted (in same transaction)
      await tx.leads.update({
        where: { id: leadId },
        data: {
          is_converted: true,
          converted_at: new Date(),
          status: 'closed',
          converted_customer_id: customer.id,
        },
      });

      return { customer_id: customer.id };
    });
  }

  async remove(id: number) {
    // Delete related interaction_logs first to avoid foreign key constraint
    await this.prisma.interaction_logs.deleteMany({
      where: { lead_id: id },
    });

    // Delete related assignment_logs
    await this.prisma.assignment_logs.deleteMany({
      where: { lead_id: id },
    });

    // Now delete the lead
    return this.prisma.leads.delete({
      where: { id },
    });
  }

  async createOrderFromLead(
    leadId: number,
    orderData: {
      description: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      totalAmount: number;
      finalAmount: number;
    },
  ) {
    // Get lead info
    const lead = await this.prisma.leads.findUnique({
      where: { id: leadId },
      include: {
        product_groups: true,
        sales_employees: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Find or create customer based on phone
    let customer = await this.prisma.customers.findFirst({
      where: { phone: lead.phone },
    });

    if (!customer) {
      const customerCode = `KH${Date.now().toString().slice(-8)}`;
      customer = await this.prisma.customers.create({
        data: {
          customer_code: customerCode,
          full_name: lead.full_name,
          phone: lead.phone,
          email: lead.email,
          original_lead_id: lead.id,
        },
      });
    }

    // Create order
    const orderCode = `ORD${Date.now().toString().slice(-8)}`;
    const order = await this.prisma.orders.create({
      data: {
        order_code: orderCode,
        customer_id: customer.id,
        product_group_id: lead.interested_product_group_id,
        description: orderData.description,
        quantity: orderData.quantity,
        unit: orderData.unit || 'cái',
        unit_price: orderData.unitPrice,
        total_amount: orderData.totalAmount,
        final_amount: orderData.finalAmount,
        status: 'pending',
        sales_employee_id: lead.assigned_sales_id,
      },
      include: {
        customers: true,
        product_groups: true,
        sales_employees: true,
      },
    });

    // Update lead as converted
    await this.prisma.leads.update({
      where: { id: leadId },
      data: {
        is_converted: true,
        status: 'closed',
      },
    });

    return {
      order_id: order.id,
      order_code: order.order_code,
      customer_id: customer.id,
      customer_code: customer.customer_code,
      order,
    };
  }

  /**
   * Convert a closed lead to customer + order with optional file uploads
   * Only works when lead status is 'closed'
   */
  async convertWithOrder(leadId: number, dto: ConvertLeadDto) {
    // Get only necessary lead fields (no includes for better performance)
    const lead = await this.prisma.leads.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        full_name: true,
        phone: true,
        email: true,
        assigned_sales_id: true,
        interested_product_group_id: true,
        status: true,
        is_converted: true,
      },
    });

    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    // Validate lead status must be 'closed'
    if (lead.status !== 'closed') {
      throw new BadRequestException(
        'Chỉ có thể tạo đơn hàng cho lead đã chốt (status = closed)',
      );
    }

    if (lead.is_converted) {
      throw new BadRequestException('Lead đã được chuyển đổi trước đó');
    }

    // Generate codes
    const timestamp = Date.now().toString().slice(-8);
    const customerCode = `KH${timestamp}`;
    const orderCode = `ORD${timestamp}`;

    // Transaction: create customer, order, and link files
    const result = await this.prisma.$transaction(async (tx) => {
      // Find or create customer (only select id for performance)
      let customer = await tx.customers.findFirst({
        where: { phone: dto.customer?.phone || lead.phone },
        select: { id: true },
      });

      if (!customer) {
        customer = await tx.customers.create({
          data: {
            customer_code: customerCode,
            full_name: dto.customer?.full_name || lead.full_name,
            phone: dto.customer?.phone || lead.phone,
            email: dto.customer?.email || lead.email,
            address: dto.customer?.address,
            company_name: dto.customer?.company_name,
            tax_code: dto.customer?.tax_code,
            original_lead_id: lead.id,
            account_manager_id: lead.assigned_sales_id,
          },
          select: { id: true },
        });
      }

      // Create order (include relations only when needed)
      const order = await tx.orders.create({
        data: {
          order_code: orderCode,
          customer_id: customer.id,
          product_group_id: lead.interested_product_group_id,
          description: dto.order.description,
          quantity: dto.order.quantity || 1,
          unit: dto.order.unit || 'cái',
          total_amount: dto.order.total_amount,
          final_amount: dto.order.total_amount,
          status: 'pending',
          sales_employee_id: lead.assigned_sales_id,
        },
        include: {
          customers: {
            select: {
              id: true,
              customer_code: true,
              full_name: true,
              phone: true,
            },
          },
          product_groups: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          sales_employees: {
            select: {
              id: true,
              full_name: true,
              employee_code: true,
            },
          },
        },
      });

      // Create design_files records in parallel (much faster than sequential)
      const designFiles = dto.files && dto.files.length > 0
        ? await Promise.all(
            dto.files.map((file) =>
              tx.design_files.create({
                data: {
                  customer_id: customer.id,
                  order_id: order.id,
                  file_name: file.file_name,
                  storage_path: `gdrive://${file.google_drive_id}`,
                  file_type: file.file_type,
                  file_size_bytes: file.file_size_bytes
                    ? BigInt(file.file_size_bytes)
                    : null,
                  google_drive_id: file.google_drive_id,
                  thumbnail_url: file.thumbnail_url,
                  file_category: 'request',
                },
              })
            )
          )
        : [];

      // Update lead as converted (in same transaction)
      await tx.leads.update({
        where: { id: leadId },
        data: {
          is_converted: true,
          converted_at: new Date(),
          converted_customer_id: customer.id,
        },
      });

      return { customer, order, designFiles };
    });

    return {
      success: true,
      customer: result.customer,
      order: result.order,
      files: result.designFiles,
    };
  }
}
