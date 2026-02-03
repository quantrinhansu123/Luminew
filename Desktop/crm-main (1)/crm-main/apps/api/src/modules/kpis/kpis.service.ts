import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKpisDto, UpdateKpisDto } from './dto/kpis.dto';

@Injectable()
export class KpisService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    search?: string;
    bo_phan?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { ho_ten: { contains: filters.search, mode: 'insensitive' } },
        { bo_phan: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters?.bo_phan) {
      where.bo_phan = { contains: filters.bo_phan, mode: 'insensitive' };
    }

    const [data, count] = await Promise.all([
      this.prisma.kpis.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.kpis.count({ where }),
    ]);

    return { data, count };
  }

  async findOne(id: number) {
    const record = await this.prisma.kpis.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('KPIs not found');
    }

    return record;
  }

  async create(createDto: CreateKpisDto) {
    return this.prisma.kpis.create({
      data: {
        ho_ten: createDto.ho_ten,
        bo_phan: createDto.bo_phan,
        kpi_thang: createDto.kpi_thang ? Number(createDto.kpi_thang) : 0,
        kpi_tuan: createDto.kpi_tuan ? Number(createDto.kpi_tuan) : 0,
        kpi_ngay: createDto.kpi_ngay ? Number(createDto.kpi_ngay) : 0,
      },
    });
  }

  async update(id: number, updateDto: UpdateKpisDto) {
    const record = await this.prisma.kpis.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('KPIs not found');
    }

    const updateData: any = {};
    if (updateDto.ho_ten !== undefined) updateData.ho_ten = updateDto.ho_ten;
    if (updateDto.bo_phan !== undefined) updateData.bo_phan = updateDto.bo_phan;
    if (updateDto.kpi_thang !== undefined) updateData.kpi_thang = Number(updateDto.kpi_thang);
    if (updateDto.kpi_tuan !== undefined) updateData.kpi_tuan = Number(updateDto.kpi_tuan);
    if (updateDto.kpi_ngay !== undefined) updateData.kpi_ngay = Number(updateDto.kpi_ngay);

    return this.prisma.kpis.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number) {
    const record = await this.prisma.kpis.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('KPIs not found');
    }

    return this.prisma.kpis.delete({
      where: { id },
    });
  }
}
