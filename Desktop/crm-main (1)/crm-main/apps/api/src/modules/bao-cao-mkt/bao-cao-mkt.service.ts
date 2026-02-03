import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBaoCaoMktDto, UpdateBaoCaoMktDto } from './dto/bao-cao-mkt.dto';

@Injectable()
export class BaoCaoMktService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    search?: string;
    page?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { ho_va_ten: { contains: filters.search, mode: 'insensitive' } },
        { page: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters?.page) {
      where.page = { contains: filters.page, mode: 'insensitive' };
    }

    const [data, count] = await Promise.all([
      this.prisma.bao_cao_mkt.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.bao_cao_mkt.count({ where }),
    ]);

    return { data, count };
  }

  async findOne(id: number) {
    const record = await this.prisma.bao_cao_mkt.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Báo cáo MKT not found');
    }

    return record;
  }

  async create(createDto: CreateBaoCaoMktDto) {
    return this.prisma.bao_cao_mkt.create({
      data: {
        ho_va_ten: createDto.ho_va_ten,
        page: createDto.page,
        cpqc: createDto.cpqc ? Number(createDto.cpqc) : 0,
        so_mess: createDto.so_mess || 0,
        so_don: createDto.so_don || 0,
        cps: createDto.cps ? Number(createDto.cps) : 0,
        ti_le_chot: createDto.ti_le_chot ? Number(createDto.ti_le_chot) : 0,
      },
    });
  }

  async update(id: number, updateDto: UpdateBaoCaoMktDto) {
    const record = await this.prisma.bao_cao_mkt.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Báo cáo MKT not found');
    }

    const updateData: any = {};
    if (updateDto.ho_va_ten !== undefined) updateData.ho_va_ten = updateDto.ho_va_ten;
    if (updateDto.page !== undefined) updateData.page = updateDto.page;
    if (updateDto.cpqc !== undefined) updateData.cpqc = Number(updateDto.cpqc);
    if (updateDto.so_mess !== undefined) updateData.so_mess = updateDto.so_mess;
    if (updateDto.so_don !== undefined) updateData.so_don = updateDto.so_don;
    if (updateDto.cps !== undefined) updateData.cps = Number(updateDto.cps);
    if (updateDto.ti_le_chot !== undefined) updateData.ti_le_chot = Number(updateDto.ti_le_chot);

    return this.prisma.bao_cao_mkt.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number) {
    const record = await this.prisma.bao_cao_mkt.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException('Báo cáo MKT not found');
    }

    return this.prisma.bao_cao_mkt.delete({
      where: { id },
    });
  }
}
