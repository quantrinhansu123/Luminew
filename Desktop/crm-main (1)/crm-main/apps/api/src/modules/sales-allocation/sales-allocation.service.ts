import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateSalesAllocationDto, UpdateSalesAllocationDto } from './dto/sales-allocation.dto';

@Injectable()
export class SalesAllocationService {
  private prisma = new PrismaClient();

  async findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { is_active: isActive } : {};
    return this.prisma.sales_allocation_rules.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: number) {
    return this.prisma.sales_allocation_rules.findUnique({
      where: { id },
    });
  }

  async create(createDto: CreateSalesAllocationDto) {
    return this.prisma.sales_allocation_rules.create({
      data: {
        rule_code: createDto.rule_code,
        customer_group: createDto.customer_group,
        product_group_ids: createDto.product_group_ids || [],
        assigned_sales_ids: createDto.assigned_sales_ids || [],
        is_active: true,
      },
    });
  }

  async update(id: number, updateDto: UpdateSalesAllocationDto) {
    return this.prisma.sales_allocation_rules.update({
      where: { id },
      data: {
        ...updateDto,
        updated_at: new Date(),
      },
    });
  }

  async remove(id: number) {
    // Soft delete
    return this.prisma.sales_allocation_rules.update({
      where: { id },
      data: { is_active: false },
    });
  }

  /**
   * Auto-distribute unassigned leads to sales employees
   * Priority 1: Assign based on product group rules (if matching)
   * Priority 2: Assign to any active sales employee (round-robin)
   */
  async autoDistribute() {
    // Get all active allocation rules
    const rules = await this.prisma.sales_allocation_rules.findMany({
      where: { is_active: true },
    });

    // Get ALL active sales employees for fallback assignment
    const allActiveSales = await this.prisma.sales_employees.findMany({
      where: { is_active: true },
      orderBy: { daily_lead_count: 'asc' },
    });

    if (allActiveSales.length === 0) {
      return {
        message: 'Không có nhân viên Sales nào đang hoạt động',
        assignedCount: 0,
        skippedCount: 0,
        totalLeads: 0
      };
    }

    // Get unassigned leads (new leads or calling status)
    const unassignedLeads = await this.prisma.leads.findMany({
      where: {
        assigned_sales_id: null,
        status: { in: ['new', 'calling'] },
        is_converted: false,
      },
      include: {
        product_groups: true,
      },
    });

    let assignedCount = 0;
    let assignedByRule = 0;
    let assignedByRoundRobin = 0;

    for (const lead of unassignedLeads) {
      let selectedSales = null;
      let assignmentMethod: 'product_based' | 'round_robin' = 'round_robin';
      let assignmentReason = '';

      // Priority 1: Try to match with allocation rules
      // Match both customer_group AND product_group if specified
      const matchingRule = rules.find((rule) => {
        // Check customer_group match (if both lead and rule have it)
        const customerGroupMatch = !rule.customer_group ||
          !lead.customer_group ||
          rule.customer_group === lead.customer_group;

        // Check product_group match
        const productGroupMatch = !lead.interested_product_group_id ||
          rule.product_group_ids.length === 0 ||
          rule.product_group_ids.includes(lead.interested_product_group_id);

        // Rule matches if both conditions are satisfied and at least one is specific
        const hasSpecificMatch =
          (rule.customer_group && lead.customer_group && rule.customer_group === lead.customer_group) ||
          (lead.interested_product_group_id && rule.product_group_ids.includes(lead.interested_product_group_id));

        return customerGroupMatch && productGroupMatch && hasSpecificMatch;
      });

      if (matchingRule && matchingRule.assigned_sales_ids.length > 0) {
        // Get sales employees from the matching rule
        const ruleSalesEmployees = await this.prisma.sales_employees.findMany({
          where: {
            id: { in: matchingRule.assigned_sales_ids },
            is_active: true,
          },
          orderBy: {
            daily_lead_count: 'asc',
          },
        });

        if (ruleSalesEmployees.length > 0) {
          selectedSales = ruleSalesEmployees[0];
          assignmentMethod = 'product_based';
          const matchInfo = [];
          if (matchingRule.customer_group) matchInfo.push(`Nhóm KH: ${matchingRule.customer_group}`);
          if (matchingRule.product_group_ids.length > 0) matchInfo.push(`Nhóm SP`);
          assignmentReason = `Phân bổ theo quy tắc: ${matchingRule.rule_code} (${matchInfo.join(', ')})`;
          assignedByRule++;
        }
      }

      // Priority 2: Fallback to round-robin if no rule matched
      if (!selectedSales) {
        // Get the latest list to ensure fair distribution
        const freshSalesList = await this.prisma.sales_employees.findMany({
          where: { is_active: true },
          orderBy: { daily_lead_count: 'asc' },
        });

        if (freshSalesList.length > 0) {
          selectedSales = freshSalesList[0];
          assignmentMethod = 'round_robin';
          assignmentReason = 'Phân bổ tự động theo vòng tròn (không khớp quy tắc)';
          assignedByRoundRobin++;
        }
      }

      // Assign the lead if we have a selected sales employee
      if (selectedSales) {
        // Assign lead to sales employee
        await this.prisma.leads.update({
          where: { id: lead.id },
          data: {
            assigned_sales_id: selectedSales.id,
            assigned_at: new Date(),
            assignment_method: assignmentMethod,
          },
        });

        // Update sales employee counts
        await this.prisma.sales_employees.update({
          where: { id: selectedSales.id },
          data: {
            daily_lead_count: { increment: 1 },
            total_lead_count: { increment: 1 },
            last_assigned_at: new Date(),
          },
        });

        // Log the assignment
        await this.prisma.assignment_logs.create({
          data: {
            lead_id: lead.id,
            sales_employee_id: selectedSales.id,
            method: assignmentMethod,
            reason: assignmentReason,
          },
        });

        assignedCount++;
      }
    }

    return {
      message: `Đã phân bổ thành công`,
      assignedCount,
      assignedByRule,
      assignedByRoundRobin,
      skippedCount: 0,
      totalLeads: unassignedLeads.length,
    };
  }
}
