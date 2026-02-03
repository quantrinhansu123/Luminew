import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get overall dashboard metrics' })
  getMetrics() {
    return this.dashboardService.getMetrics();
  }

  @Get('employee-kpis')
  @ApiOperation({ summary: 'Get employee KPI data' })
  getEmployeeKPIs() {
    return this.dashboardService.getEmployeeKPIs();
  }

  @Get('chart-data')
  @ApiOperation({ summary: 'Get chart data for Lead vs Orders over time' })
  getChartData() {
    return this.dashboardService.getChartData();
  }

  @Get('employee-ranking')
  @ApiOperation({ summary: 'Get top and bottom performing employees' })
  getEmployeeRanking() {
    return this.dashboardService.getEmployeeRanking();
  }
}
