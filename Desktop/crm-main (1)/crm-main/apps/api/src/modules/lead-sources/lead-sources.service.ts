import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';

@Injectable()
export class LeadSourcesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.lead_sources.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.lead_sources.findUnique({
      where: { id },
    });
  }

  async create(createLeadSourceDto: CreateLeadSourceDto) {
    return this.prisma.lead_sources.create({
      data: createLeadSourceDto,
    });
  }

  async update(id: number, updateLeadSourceDto: UpdateLeadSourceDto) {
    return this.prisma.lead_sources.update({
      where: { id },
      data: updateLeadSourceDto,
    });
  }

  async remove(id: number) {
    return this.prisma.lead_sources.delete({
      where: { id },
    });
  }
}
