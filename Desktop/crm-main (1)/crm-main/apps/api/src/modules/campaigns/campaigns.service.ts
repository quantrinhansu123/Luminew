import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async findAll(sourceId?: number) {
    return this.prisma.campaigns.findMany({
      where: sourceId ? { source_id: sourceId } : undefined,
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.campaigns.findUnique({
      where: { id },
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async create(createCampaignDto: CreateCampaignDto) {
    return this.prisma.campaigns.create({
      data: createCampaignDto,
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async update(id: number, updateCampaignDto: UpdateCampaignDto) {
    return this.prisma.campaigns.update({
      where: { id },
      data: updateCampaignDto,
      include: {
        lead_sources: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });
  }

  async remove(id: number) {
    return this.prisma.campaigns.delete({
      where: { id },
    });
  }
}
