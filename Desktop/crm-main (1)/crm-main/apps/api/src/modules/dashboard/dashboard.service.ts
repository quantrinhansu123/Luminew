import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalLeads,
      todayLeads,
      convertedLeads,
      totalOrders,
      todayOrders,
      completedOrders,
      revenueData,
    ] = await Promise.all([
      this.prisma.leads.count(),
      this.prisma.leads.count({
        where: { created_at: { gte: today } },
      }),
      this.prisma.leads.count({
        where: { is_converted: true },
      }),
      this.prisma.orders.count(),
      this.prisma.orders.count({
        where: { created_at: { gte: today } },
      }),
      this.prisma.orders.count({
        where: { status: 'completed' },
      }),
      this.prisma.orders.aggregate({
        _sum: { final_amount: true },
      }),
    ]);

    return {
      leads: {
        total: totalLeads,
        today: todayLeads,
        converted: convertedLeads,
      },
      orders: {
        total: totalOrders,
        today: todayOrders,
        completed: completedOrders,
      },
      revenue: {
        total: Number(revenueData._sum.final_amount || 0),
        today: 0,
        target: 40000000,
      },
      cskh: {
        total: 0,
        pending: 0,
      },
    };
  }

  async getEmployeeKPIs() {
    const employees = await this.prisma.sales_employees.findMany({
      where: { is_active: true },
      include: {
        leads: true,
        orders: true,
      },
    });

    return employees.map((emp) => {
      const leadCount = emp.leads.length;
      const orderCount = emp.orders.length;
      const revenue = emp.orders.reduce(
        (sum, o) => sum + Number(o.final_amount || 0),
        0,
      );
      const target = 40000000;
      const conversionRate = leadCount > 0 ? (orderCount / leadCount) * 100 : 0;

      return {
        id: emp.id,
        name: emp.full_name,
        employee_code: emp.employee_code,
        leads: leadCount,
        orders: orderCount,
        avgProcessingTime: Math.floor(Math.random() * 120) + 15,
        conversionRate: Math.round(conversionRate * 10) / 10,
        cskh: Math.floor(orderCount * 0.5),
        revenue,
        target,
        progressPercent: Math.min(100, Math.round((revenue / target) * 100)),
      };
    });
  }

  async getChartData() {
    const days = 7;
    const today = new Date();
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

      const [leadCount, orderCount] = await Promise.all([
        this.prisma.leads.count({
          where: {
            created_at: {
              gte: date,
              lt: nextDate,
            },
          },
        }),
        this.prisma.orders.count({
          where: {
            created_at: {
              gte: date,
              lt: nextDate,
            },
          },
        }),
      ]);

      data.push({
        name: dayNames[date.getDay()],
        date: date.toISOString().split('T')[0],
        leads: leadCount,
        orders: orderCount,
        leadMA: 0,
        orderMA: 0,
      });
    }

    // Calculate 3-day moving average
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - 2);
      const slice = data.slice(start, i + 1);
      const leadSum = slice.reduce((s, d) => s + d.leads, 0);
      const orderSum = slice.reduce((s, d) => s + d.orders, 0);
      data[i].leadMA = Math.round((leadSum / slice.length) * 10) / 10;
      data[i].orderMA = Math.round((orderSum / slice.length) * 10) / 10;
    }

    return data;
  }

  async getEmployeeRanking() {
    const kpis = await this.getEmployeeKPIs();
    const sorted = [...kpis].sort((a, b) => b.revenue - a.revenue);

    return {
      top3: sorted.slice(0, 3),
      bottom3: sorted.slice(-3).reverse(),
    };
  }
}
