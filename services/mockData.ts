
import { SummaryCardData, ChartDataPoint } from '../types';

export const MOCK_SUMMARY_CARDS: SummaryCardData[] = [
  { title: 'TỔNG DT', value: '180 tỷ', trend: 'up', percentage: '+12%', avgValue: 'TB 3 tỷ' },
  { title: 'DT LUMORA', value: '106 tỷ', subValue: '(59%)', trend: 'up', percentage: '+15%', avgValue: 'TB 3 tỷ' },
  { title: 'ADS / DT', value: '30%', trend: 'down', percentage: '-2%', avgValue: 'TB 3 tỷ' },
  { title: 'LN / DT', value: '30%', trend: 'up', percentage: '+10%', avgValue: 'TB 3 tỷ' },
];

export const MOCK_KPI_SUMMARY: SummaryCardData[] = [
  { title: 'TIẾN ĐỘ DOANH THU', value: '85%', subValue: '(153/180 tỷ)', trend: 'up', percentage: 'On track', avgValue: 'Mục tiêu: 100%' },
  { title: 'TỈ LỆ CHỐT TB', value: '7.5%', subValue: '', trend: 'up', percentage: '+0.5%', avgValue: 'KPI: 8.0%' },
  { title: 'CHI PHÍ ADS', value: '54 tỷ', subValue: '', trend: 'down', percentage: '-5%', avgValue: 'Ngân sách: 60 tỷ' },
  { title: 'SỐ ĐƠN THÀNH CÔNG', value: '12,450', subValue: '', trend: 'up', percentage: '+12%', avgValue: 'KPI: 15,000' },
];

export const MOCK_CHART_DATA: ChartDataPoint[] = [
  { month: 'T9', totalDT: 150, lumoraDT: 80, adsRatio: 28, lnRatio: 25 },
  { month: 'T10', totalDT: 165, lumoraDT: 95, adsRatio: 31, lnRatio: 28 },
  { month: 'T11', totalDT: 175, lumoraDT: 100, adsRatio: 30, lnRatio: 32 },
  { month: 'T12', totalDT: 180, lumoraDT: 106, adsRatio: 33, lnRatio: 30 },
];

export const KPI_PERFORMANCE_DATA = [
  { name: 'Tuần 1', actual: 40, target: 45 },
  { name: 'Tuần 2', actual: 55, target: 45 },
  { name: 'Tuần 3', actual: 48, target: 45 },
  { name: 'Tuần 4', actual: 60, target: 45 },
];

export const TEAM_PERFORMANCE = [
  { name: 'Sale ngày', data: [40, 30, 20, 15] },
  { name: 'Sale đêm', data: [10, 15, 12, 8] },
  { name: 'MKT', data: [80, 95, 45, 35] },
  { name: 'Vận đơn', data: [60, 75, 65, 55] },
  { name: 'CSKH', data: [55, 70, 15, 12] },
];

export const INDIVIDUAL_RANKING = [
  { id: 1, name: 'Trình-PT', team: 'TEAM SALE', value: '296 Tr', rate: '5.7%', mess: '1,036', orders: '59', avatar: 'https://picsum.photos/40/40?1' },
  { id: 2, name: 'Lệ-PT', team: 'TEAM SALE', value: '269 Tr', rate: '8.1%', mess: '679', orders: '55', avatar: 'https://picsum.photos/40/40?2' },
  { id: 3, name: 'Duyên-NM', team: 'TEAM SALE', value: '242 Tr', rate: '7.4%', mess: '706', orders: '52', avatar: 'https://picsum.photos/40/40?3' },
];

export const TEAM_SPECIFIC_DETAILS: Record<string, any> = {
  'MKT': {
    metrics: [
      { month: 'T9', adsRatio: 28, mesCount: 1500, mesCommit: 1400, costPerMes: 35000 },
      { month: 'T10', adsRatio: 31, mesCount: 1650, mesCommit: 1600, costPerMes: 34000 },
      { month: 'T11', adsRatio: 30, mesCount: 1800, mesCommit: 1750, costPerMes: 33000 },
      { month: 'T12', adsRatio: 33, mesCount: 1900, mesCommit: 1800, costPerMes: 36000 },
    ],
    chartConfig: {
      type: 'composed',
      lines: [
        { key: 'adsRatio', name: 'Tỷ lệ ADS (%)', color: '#ef4444', type: 'area' },
        { key: 'mesCount', name: 'Số Mes thực tế', color: '#3b82f6', type: 'bar' },
      ]
    },
    secondaryChart: {
      title: 'Hiệu suất Mes',
      lines: [
        { key: 'mesCommit', name: 'Mes Cam kết', color: '#10b981' },
      ]
    }
  },
  'Sale': {
    metrics: [
      { month: 'T9', closeRate: 15, callCount: 5000, revenue: 40 },
      { month: 'T10', closeRate: 14, callCount: 5200, revenue: 30 },
      { month: 'T11', closeRate: 16, callCount: 5500, revenue: 20 },
      { month: 'T12', closeRate: 18, callCount: 6000, revenue: 15 },
    ],
    chartConfig: {
      type: 'composed',
      lines: [
        { key: 'revenue', name: 'Doanh số (Tỷ)', color: '#f59e0b', type: 'bar' },
        { key: 'closeRate', name: 'Tỷ lệ chốt (%)', color: '#8b5cf6', type: 'line' },
      ]
    },
    secondaryChart: {
      title: 'Hoạt động Sale',
      lines: [
        { key: 'callCount', name: 'Số cuộc gọi', color: '#06b6d4' },
      ]
    }
  },
  'CSKH': {
    metrics: [
      { month: 'T9', responseTime: 5, satisfaction: 4.5, ticketCount: 200 },
      { month: 'T10', responseTime: 4.8, satisfaction: 4.6, ticketCount: 220 },
      { month: 'T11', responseTime: 4.5, satisfaction: 4.7, ticketCount: 180 },
      { month: 'T12', responseTime: 4.2, satisfaction: 4.8, ticketCount: 190 },
    ],
    chartConfig: {
      type: 'composed',
      lines: [
        { key: 'satisfaction', name: 'Điểm hài lòng', color: '#ec4899', type: 'line' },
        { key: 'ticketCount', name: 'Số sự vụ', color: '#6366f1', type: 'bar' },
      ]
    },
    secondaryChart: {
      title: 'Tốc độ phản hồi',
      lines: [
        { key: 'responseTime', name: 'Phản hồi (phút)', color: '#14b8a6' },
      ]
    }
  },
  'Vận đơn': {
    metrics: [
      { month: 'T9', shipTime: 3.5, returnRate: 5, shipCost: 12 },
      { month: 'T10', shipTime: 3.2, returnRate: 4.8, shipCost: 13 },
      { month: 'T11', shipTime: 3.0, returnRate: 4.5, shipCost: 14 },
      { month: 'T12', shipTime: 2.8, returnRate: 4.2, shipCost: 15 },
    ],
    chartConfig: {
      type: 'composed',
      lines: [
        { key: 'shipCost', name: 'Chi phí vận chuyển', color: '#f97316', type: 'bar' },
        { key: 'returnRate', name: 'Tỷ lệ hoàn (%)', color: '#dc2626', type: 'line' },
      ]
    },
    secondaryChart: {
      title: 'Thời gian giao hàng',
      lines: [
        { key: 'shipTime', name: 'Trung bình (ngày)', color: '#84cc16' },
      ]
    }
  },
  'HCNS': {
    metrics: [
      { month: 'T9', staffCount: 150, turnover: 2, trainingHours: 40 },
      { month: 'T10', staffCount: 155, turnover: 1.5, trainingHours: 50 },
      { month: 'T11', staffCount: 160, turnover: 1.8, trainingHours: 45 },
      { month: 'T12', staffCount: 165, turnover: 1.2, trainingHours: 60 },
    ],
    chartConfig: {
      type: 'composed',
      lines: [
        { key: 'staffCount', name: 'Nhân sự', color: '#3b82f6', type: 'bar' },
        { key: 'turnover', name: 'Biến động (%)', color: '#f43f5e', type: 'line' },
      ]
    },
    secondaryChart: {
      title: 'Đào tạo',
      lines: [
        { key: 'trainingHours', name: 'Giờ đào tạo', color: '#a855f7' },
      ]
    }
  },
  'R&D': {
    metrics: [
      { month: 'T9', newProducts: 2, successRate: 80, cycleTime: 45 },
      { month: 'T10', newProducts: 3, successRate: 85, cycleTime: 40 },
      { month: 'T11', newProducts: 1, successRate: 90, cycleTime: 35 },
      { month: 'T12', newProducts: 4, successRate: 88, cycleTime: 38 },
    ],
    chartConfig: {
      type: 'composed',
      lines: [
        { key: 'newProducts', name: 'Sản phẩm mới', color: '#10b981', type: 'bar' },
        { key: 'successRate', name: 'Tỷ lệ thành công (%)', color: '#f59e0b', type: 'line' },
      ]
    },
    secondaryChart: {
      title: 'Tốc độ R&D',
      lines: [
        { key: 'cycleTime', name: 'Cycle Time (ngày)', color: '#6366f1' },
      ]
    }
  }
};

export const INDIVIDUAL_DETAILS: Record<number, any> = {
  1: { // Trình-PT
    name: 'Trình-PT',
    role: 'Sale Leader',
    metrics: [
      { month: 'T9', revenue: 70, adsRatio: 28, mesCommit: 250, mesActual: 260 },
      { month: 'T10', revenue: 65, adsRatio: 30, mesCommit: 250, mesActual: 240 },
      { month: 'T11', revenue: 80, adsRatio: 25, mesCommit: 300, mesActual: 310 },
      { month: 'T12', revenue: 81, adsRatio: 27, mesCommit: 300, mesActual: 280 }
    ],
    kpis: [
      { name: 'Tỷ lệ chốt', value: '5.7%', target: '6.0%', trend: -0.3, status: 'warning' },
      { name: 'Số cuộc gọi', value: '1,200', target: '1,000', trend: 200, status: 'success' },
      { name: 'Tỷ lệ hoàn', value: '2%', target: '3%', trend: -1, status: 'success' },
      { name: 'AOV', value: '500k', target: '480k', trend: 20, status: 'success' }
    ]
  },
  2: { // Lệ-PT
    name: 'Lệ-PT',
    role: 'Sale Member',
    metrics: [
      { month: 'T9', revenue: 60, adsRatio: 25, mesCommit: 200, mesActual: 190 },
      { month: 'T10', revenue: 68, adsRatio: 24, mesCommit: 220, mesActual: 230 },
      { month: 'T11', revenue: 70, adsRatio: 26, mesCommit: 250, mesActual: 240 },
      { month: 'T12', revenue: 71, adsRatio: 25, mesCommit: 250, mesActual: 260 }
    ],
    kpis: [
      { name: 'Tỷ lệ chốt', value: '8.1%', target: '7.5%', trend: 0.6, status: 'success' },
      { name: 'Số cuộc gọi', value: '950', target: '1,000', trend: -50, status: 'warning' },
      { name: 'Tỷ lệ hoàn', value: '1.5%', target: '3%', trend: -1.5, status: 'success' },
      { name: 'AOV', value: '450k', target: '480k', trend: -30, status: 'warning' }
    ]
  },
  3: { // Duyên-NM
    name: 'Duyên-NM',
    role: 'Sale Member',
    metrics: [
      { month: 'T9', revenue: 50, adsRatio: 30, mesCommit: 200, mesActual: 210 },
      { month: 'T10', revenue: 55, adsRatio: 29, mesCommit: 220, mesActual: 230 },
      { month: 'T11', revenue: 65, adsRatio: 28, mesCommit: 250, mesActual: 260 },
      { month: 'T12', revenue: 72, adsRatio: 26, mesCommit: 280, mesActual: 290 }
    ],
    kpis: [
      { name: 'Tỷ lệ chốt', value: '7.4%', target: '7.5%', trend: -0.1, status: 'warning' },
      { name: 'Số cuộc gọi', value: '1,100', target: '1,000', trend: 100, status: 'success' },
      { name: 'Tỷ lệ hoàn', value: '2.5%', target: '3%', trend: -0.5, status: 'success' },
      { name: 'AOV', value: '490k', target: '480k', trend: 10, status: 'success' }
    ]
  }
};
