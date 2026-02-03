
export enum DashboardTab {
  GROWTH = 'GROWTH',
  KPI = 'KPI',
  OKR = 'OKR'
}

export enum ViewLevel {
  COMPANY = 'COMPANY',
  TEAM = 'TEAM',
  INDIVIDUAL = 'INDIVIDUAL'
}

export interface SummaryCardData {
  title: string;
  value: string;
  subValue?: string;
  trend: 'up' | 'down';
  percentage: string;
  avgValue: string;
}

export interface ChartDataPoint {
  month: string;
  totalDT: number;
  lumoraDT: number;
  adsRatio: number;
  lnRatio: number;
}
