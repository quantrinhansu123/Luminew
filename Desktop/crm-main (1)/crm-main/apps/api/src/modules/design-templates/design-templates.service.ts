import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDesignTemplateDto, UpdateDesignTemplateDto } from './dto/design-template.dto';

@Injectable()
export class DesignTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query?: { type?: string; category?: string; search?: string }) {
    const where: any = {};

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.category) {
      where.category = query.category;
    }

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.design_templates.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.design_templates.findUnique({
      where: { id },
    });
  }

  async create(data: CreateDesignTemplateDto) {
    return this.prisma.design_templates.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        category: data.category,
        tags: data.tags || [],
        thumbnailUrl: data.thumbnailUrl,
        fileUrls: data.fileUrls || [],
        dimensions: data.dimensions,
        paperWeight: data.paperWeight,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        sourceOrderId: data.sourceOrderId,
        notes: data.notes,
        isPublic: data.isPublic ?? false,
      },
    });
  }

  async update(id: string, data: UpdateDesignTemplateDto) {
    return this.prisma.design_templates.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.design_templates.delete({
      where: { id },
    });
  }

  async incrementUsage(id: string) {
    return this.prisma.design_templates.update({
      where: { id },
      data: {
        usageCount: { increment: 1 },
      },
    });
  }

  // Create template from a design order
  async createFromDesignOrder(orderId: string, templateData: Partial<CreateDesignTemplateDto>) {
    // Get the design order
    const order = await this.prisma.design_orders.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Design order not found');
    }

    // Create template from order data
    return this.prisma.design_templates.create({
      data: {
        name: templateData.name || `Mẫu từ ${order.customerName}`,
        description: templateData.description || order.requirements,
        type: templateData.type || order.productType,
        category: templateData.category,
        tags: templateData.tags || [],
        thumbnailUrl: (order.fileUrls as any[])?.[0]?.url || null,
        fileUrls: order.fileUrls || [],
        customerName: order.customerName,
        customerPhone: order.phone,
        sourceOrderId: orderId,
        notes: templateData.notes,
        isPublic: templateData.isPublic ?? false,
      },
    });
  }

  // Get statistics
  async getStats() {
    const [total, byType, recent] = await Promise.all([
      this.prisma.design_templates.count(),
      this.prisma.design_templates.groupBy({
        by: ['type'],
        _count: true,
      }),
      this.prisma.design_templates.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, thumbnailUrl: true, type: true },
      }),
    ]);

    return { total, byType, recent };
  }
}
