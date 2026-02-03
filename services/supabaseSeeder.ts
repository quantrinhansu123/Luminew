import { supabase } from './supabaseClient';
import { SummaryCardData, ChartDataPoint } from '../types';
import { 
  MOCK_SUMMARY_CARDS, 
  MOCK_KPI_SUMMARY, 
  MOCK_CHART_DATA, 
  KPI_PERFORMANCE_DATA, 
  TEAM_PERFORMANCE, 
  INDIVIDUAL_RANKING 
} from './mockData';

/**
 * Tự động thêm dữ liệu vào các bảng Supabase
 */

// Thêm dữ liệu Summary Cards
export async function seedSummaryCards(data: SummaryCardData[], tableName: string = 'summary_cards') {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data.map(item => ({
        title: item.title,
        value: item.value,
        sub_value: item.subValue || null,
        trend: item.trend,
        percentage: item.percentage,
        avg_value: item.avgValue,
        created_at: new Date().toISOString()
      })));

    if (error) {
      console.error(`Lỗi khi thêm dữ liệu vào ${tableName}:`, error);
      return { success: false, error };
    }

    console.log(`✅ Đã thêm ${data.length} bản ghi vào ${tableName}`);
    return { success: true, data: result };
  } catch (error) {
    console.error(`Lỗi không mong đợi khi thêm dữ liệu vào ${tableName}:`, error);
    return { success: false, error };
  }
}

// Thêm dữ liệu Chart Data
export async function seedChartData(data: ChartDataPoint[], tableName: string = 'chart_data') {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data.map(item => ({
        month: item.month,
        total_dt: item.totalDT,
        lumora_dt: item.lumoraDT,
        ads_ratio: item.adsRatio,
        ln_ratio: item.lnRatio,
        created_at: new Date().toISOString()
      })));

    if (error) {
      console.error(`Lỗi khi thêm dữ liệu vào ${tableName}:`, error);
      return { success: false, error };
    }

    console.log(`✅ Đã thêm ${data.length} bản ghi vào ${tableName}`);
    return { success: true, data: result };
  } catch (error) {
    console.error(`Lỗi không mong đợi khi thêm dữ liệu vào ${tableName}:`, error);
    return { success: false, error };
  }
}

// Thêm dữ liệu KPI Performance
export async function seedKPIPerformance(data: typeof KPI_PERFORMANCE_DATA, tableName: string = 'kpi_performance') {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data.map(item => ({
        name: item.name,
        actual: item.actual,
        target: item.target,
        created_at: new Date().toISOString()
      })));

    if (error) {
      console.error(`Lỗi khi thêm dữ liệu vào ${tableName}:`, error);
      return { success: false, error };
    }

    console.log(`✅ Đã thêm ${data.length} bản ghi vào ${tableName}`);
    return { success: true, data: result };
  } catch (error) {
    console.error(`Lỗi không mong đợi khi thêm dữ liệu vào ${tableName}:`, error);
    return { success: false, error };
  }
}

// Thêm dữ liệu Team Performance
export async function seedTeamPerformance(data: typeof TEAM_PERFORMANCE, tableName: string = 'team_performance') {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data.map(item => ({
        name: item.name,
        data: item.data,
        created_at: new Date().toISOString()
      })));

    if (error) {
      console.error(`Lỗi khi thêm dữ liệu vào ${tableName}:`, error);
      return { success: false, error };
    }

    console.log(`✅ Đã thêm ${data.length} bản ghi vào ${tableName}`);
    return { success: true, data: result };
  } catch (error) {
    console.error(`Lỗi không mong đợi khi thêm dữ liệu vào ${tableName}:`, error);
    return { success: false, error };
  }
}

// Thêm dữ liệu Individual Ranking
export async function seedIndividualRanking(data: typeof INDIVIDUAL_RANKING, tableName: string = 'individual_ranking') {
  try {
    const { data: result, error } = await supabase
      .from(tableName)
      .insert(data.map(item => ({
        id: item.id,
        name: item.name,
        team: item.team,
        value: item.value,
        rate: item.rate,
        mess: item.mess,
        orders: item.orders,
        avatar: item.avatar,
        created_at: new Date().toISOString()
      })));

    if (error) {
      console.error(`Lỗi khi thêm dữ liệu vào ${tableName}:`, error);
      return { success: false, error };
    }

    console.log(`✅ Đã thêm ${data.length} bản ghi vào ${tableName}`);
    return { success: true, data: result };
  } catch (error) {
    console.error(`Lỗi không mong đợi khi thêm dữ liệu vào ${tableName}:`, error);
    return { success: false, error };
  }
}

/**
 * Hàm tổng hợp để thêm tất cả dữ liệu vào Supabase
 * @param clearExisting - Xóa dữ liệu cũ trước khi thêm mới (mặc định: false)
 */
export async function seedAllData(clearExisting: boolean = false) {
  console.log('🚀 Bắt đầu thêm dữ liệu vào Supabase...\n');

  if (clearExisting) {
    console.log('⚠️  Xóa dữ liệu cũ...');
    // Xóa dữ liệu cũ (nếu cần)
    const tables = ['summary_cards', 'kpi_summary', 'chart_data', 'kpi_performance', 'team_performance', 'individual_ranking'];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().neq('id', 0);
      if (error) {
        console.warn(`Không thể xóa dữ liệu từ ${table}:`, error.message);
      }
    }
  }

  const results = {
    summaryCards: await seedSummaryCards(MOCK_SUMMARY_CARDS, 'summary_cards'),
    kpiSummary: await seedSummaryCards(MOCK_KPI_SUMMARY, 'kpi_summary'),
    chartData: await seedChartData(MOCK_CHART_DATA, 'chart_data'),
    kpiPerformance: await seedKPIPerformance(KPI_PERFORMANCE_DATA, 'kpi_performance'),
    teamPerformance: await seedTeamPerformance(TEAM_PERFORMANCE, 'team_performance'),
    individualRanking: await seedIndividualRanking(INDIVIDUAL_RANKING, 'individual_ranking'),
  };

  const successCount = Object.values(results).filter(r => r.success).length;
  const totalCount = Object.keys(results).length;

  console.log(`\n📊 Kết quả: ${successCount}/${totalCount} bảng đã được thêm dữ liệu thành công`);

  return results;
}
