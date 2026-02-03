import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDesignOrderDto, UpdateDesignOrderDto } from './dto/design-order.dto';

@Injectable()
export class DesignOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.design_orders.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.design_orders.findUnique({
      where: { id },
    });
  }

  async create(data: CreateDesignOrderDto) {
    return this.prisma.design_orders.create({
      data: {
        customerName: data.customerName,
        phone: data.phone,
        productType: data.productType,
        requirements: data.requirements,
        revenue: data.revenue,
        deadline: new Date(data.deadline),
        designer: data.designer,
        imageUrl: data.imageUrl,
      },
    });
  }

  async update(id: string, data: UpdateDesignOrderDto) {
    const updateData: any = {};
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.productType !== undefined) updateData.productType = data.productType;
    if (data.requirements !== undefined) updateData.requirements = data.requirements;
    if (data.designer !== undefined) updateData.designer = data.designer;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.revenue !== undefined) updateData.revenue = data.revenue;
    if (data.deadline !== undefined) updateData.deadline = new Date(data.deadline);
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;

    return this.prisma.design_orders.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return this.prisma.design_orders.delete({
      where: { id },
    });
  }
}
