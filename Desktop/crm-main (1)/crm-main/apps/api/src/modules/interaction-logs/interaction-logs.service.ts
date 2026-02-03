import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInteractionLogDto } from './dto/create-interaction-log.dto';

@Injectable()
export class InteractionLogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(leadId?: number, limit?: number) {
    const where: any = {};
    if (leadId) where.lead_id = leadId;

    return this.prisma.interaction_logs.findMany({
      where,
      orderBy: { occurred_at: 'desc' },
      take: limit || 100, // Limit to 100 most recent interactions
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

  async findOne(id: number) {
    return this.prisma.interaction_logs.findUnique({
      where: { id },
    });
  }

  async create(createInteractionLogDto: CreateInteractionLogDto) {
    const interaction = await this.prisma.interaction_logs.create({
      data: {
        lead_id: createInteractionLogDto.lead_id,
        type: createInteractionLogDto.type,
        content: createInteractionLogDto.content,
        summary: createInteractionLogDto.summary,
        duration_seconds: createInteractionLogDto.duration_seconds,
        occurred_at: createInteractionLogDto.occurred_at
          ? new Date(createInteractionLogDto.occurred_at)
          : new Date(),
      },
    });

    // Update lead's last_contacted_at
    await this.prisma.leads.update({
      where: { id: createInteractionLogDto.lead_id },
      data: { last_contacted_at: interaction.occurred_at },
    });

    return interaction;
  }

  async remove(id: number) {
    return this.prisma.interaction_logs.delete({
      where: { id },
    });
  }
}
