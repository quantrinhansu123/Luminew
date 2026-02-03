'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  Search,
  Download,
  RotateCcw,
  Trophy,
  TrendingDown,
  User,
  MoreVertical,
  Target,
  Clock,
  BarChart3,
  Calendar,
  Filter,
  X,
  ChevronDown
} from 'lucide-react';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { supabase } from '@/lib/supabase';

const DASHBOARD_CACHE_KEY = 'crm.dashboard.cache.v1';
const DASHBOARD_CACHE_TTL_MS = 60_000; // 60s

function readCache<T>(key: string): { ts: number; value: T } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; value: T };
    if (!parsed?.ts) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }));
  } catch {
    // ignore
  }
}

interface EmployeeKPI {
  id: number;
  name: string;
  employee_code: string;
  leads: number;
  orders: number;
  avgProcessingTime: number;
  conversionRate: number;
  cskh: number;
  revenue: number;
  target: number;
  progressPercent: number;
  // KPI targets from kpis table
  kpi_thang?: number | null;
  kpi_tuan?: number | null;
  kpi_ngay?: number | null;
  bo_phan?: string | null;
}

interface ChartDataPoint {
  name: string;
  date: string;
  leads: number;
  orders: number;
  leadMA: number;
  orderMA: number;
}

interface DashboardMetrics {
  leads: { total: number; today: number; converted: number };
  orders: { total: number; today: number; completed: number };
  revenue: { total: number; today: number; target: number };
  cskh: { total: number; pending: number };
}

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [employeeKPIs, setEmployeeKPIs] = useState<EmployeeKPI[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [ranking, setRanking] = useState<{ top3: EmployeeKPI[]; bottom3: EmployeeKPI[] }>({ top3: [], bottom3: [] });
  const [isLoading, setIsLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSales, setFilterSales] = useState<string[]>([]);
  
  // Date filter states
  const [quickFilter, setQuickFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [isQuickFilterOpen, setIsQuickFilterOpen] = useState(false);
  
  // Advanced filter states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterDepartment, setFilterDepartment] = useState<string[]>([]);
  
  // Progress period selector
  const [progressPeriod, setProgressPeriod] = useState<'ngay' | 'tuan' | 'thang'>('thang');
  const [isProgressPeriodOpen, setIsProgressPeriodOpen] = useState(false);
  
  const quickFilterRef = useRef<HTMLDivElement>(null);
  const progressPeriodRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickFilterRef.current && !quickFilterRef.current.contains(event.target as Node)) {
        setIsQuickFilterOpen(false);
      }
      if (progressPeriodRef.current && !progressPeriodRef.current.contains(event.target as Node)) {
        setIsProgressPeriodOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  // Helper function to get date range from quick filter
  const getDateRangeFromQuickFilter = (filter: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (filter) {
      case 'today':
        return {
          from: today.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          from: yesterday.toISOString().split('T')[0],
          to: yesterday.toISOString().split('T')[0]
        };
      case 'thisWeek':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        return {
          from: startOfWeek.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
      case 'lastWeek':
        const lastWeekStart = new Date(today);
        lastWeekStart.setDate(today.getDate() - today.getDay() - 7);
        const lastWeekEnd = new Date(today);
        lastWeekEnd.setDate(today.getDate() - today.getDay() - 1);
        return {
          from: lastWeekStart.toISOString().split('T')[0],
          to: lastWeekEnd.toISOString().split('T')[0]
        };
      case 'thisMonth':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: startOfMonth.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
      default:
        if (filter.startsWith('month-')) {
          const monthNum = parseInt(filter.split('-')[1]);
          const startOfSelectedMonth = new Date(today.getFullYear(), monthNum - 1, 1);
          const endOfSelectedMonth = new Date(today.getFullYear(), monthNum, 0);
          return {
            from: startOfSelectedMonth.toISOString().split('T')[0],
            to: endOfSelectedMonth.toISOString().split('T')[0]
          };
        }
        return null;
    }
  };
  
  // Apply quick filter
  useEffect(() => {
    if (quickFilter) {
      const range = getDateRangeFromQuickFilter(quickFilter);
      if (range) {
        setFromDate(range.from);
        setToDate(range.to);
      }
    }
  }, [quickFilter]);

  // Get effective date range from filters
  const getEffectiveDateRange = () => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (fromDate && toDate) {
      // Use manual date range
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        fromDateStr: fromDate,
        toDateStr: toDate,
      };
    } else if (quickFilter) {
      // Use quick filter range
      const range = getDateRangeFromQuickFilter(quickFilter);
      if (range) {
        const from = new Date(range.from);
        from.setHours(0, 0, 0, 0);
        const to = new Date(range.to);
        to.setHours(23, 59, 59, 999);
        return {
          from: from.toISOString(),
          to: to.toISOString(),
          fromDateStr: range.from,
          toDateStr: range.to,
        };
      }
    }
    
    // Default: last 14 days
    const startOf14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    startOf14Days.setHours(0, 0, 0, 0);
    return {
      from: startOf14Days.toISOString(),
      to: now.toISOString(),
      fromDateStr: startOf14Days.toISOString().split('T')[0],
      toDateStr: now.toISOString().split('T')[0],
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const dateRange = getEffectiveDateRange();
        const cacheKey = `${DASHBOARD_CACHE_KEY}:${dateRange.fromDateStr}:${dateRange.toDateStr}`;
        
        // fast paint from cache
        const cached = readCache<{
          metrics: DashboardMetrics | null;
          employeeKPIs: EmployeeKPI[];
          chartData: ChartDataPoint[];
          ranking: { top3: EmployeeKPI[]; bottom3: EmployeeKPI[] };
        }>(cacheKey);

        if (cached && Date.now() - cached.ts < DASHBOARD_CACHE_TTL_MS) {
          setMetrics(cached.value.metrics);
          setEmployeeKPIs(cached.value.employeeKPIs);
          setChartData(cached.value.chartData);
          setRanking(cached.value.ranking);
          setIsLoading(false);
        } else {
          setIsLoading(true);
        }

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        // Keep counts (fast) but avoid downloading big tables
        const [leadsTotal, leadsToday, leadsConverted, ordersTotal, ordersToday, ordersCompleted] =
          await Promise.all([
            supabase.from('leads').select('id', { count: 'exact', head: true }),
            supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday),
            supabase.from('leads').select('id', { count: 'exact', head: true }).eq('is_converted', true),
            supabase.from('orders').select('id', { count: 'exact', head: true }),
            supabase.from('orders').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday),
            supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['completed', 'delivered']),
          ]);

        const metricsPayload: DashboardMetrics = {
          leads: {
            total: leadsTotal.count || 0,
            today: leadsToday.count || 0,
            converted: leadsConverted.count || 0,
          },
          orders: {
            total: ordersTotal.count || 0,
            today: ordersToday.count || 0,
            completed: ordersCompleted.count || 0,
          },
          revenue: {
            total: 0,
            today: 0,
            target: 0,
          },
          cskh: {
            total: 0,
            pending: 0,
          },
        };

        // ---- Fetch data for KPIs + charts based on date range ----
        const [employeesRes, leadsRes14, ordersRes14, kpisRes] = await Promise.all([
          supabase.from('sales_employees').select('id, full_name, employee_code').eq('is_active', true),
          supabase.from('leads')
            .select('id, assigned_sales_id, created_at')
            .gte('created_at', dateRange.from)
            .lte('created_at', dateRange.to),
          supabase
            .from('orders')
            .select('id, sales_employee_id, final_amount, status, created_at')
            .gte('created_at', dateRange.from)
            .lte('created_at', dateRange.to),
          supabase.from('kpis').select('ho_ten, kpi_thang, kpi_tuan, kpi_ngay, bo_phan'),
        ]);

        if (employeesRes.error) throw employeesRes.error;
        if (leadsRes14.error) throw leadsRes14.error;
        if (ordersRes14.error) throw ordersRes14.error;
        if (kpisRes.error) throw kpisRes.error;

        const employees = employeesRes.data || [];
        const leads = leadsRes14.data || [];
        const orders = ordersRes14.data || [];

        // Revenue: compute from 14-day dataset (fast); totals can be heavy on large DBs
        const safeSum = (rows: any[]) =>
          (rows || [])
            .filter((r) => r?.status !== 'cancelled')
            .reduce((acc, r) => acc + Number(r.final_amount || 0), 0);

        metricsPayload.revenue.total = safeSum(orders);
        metricsPayload.revenue.today = safeSum(
          orders.filter((o: any) => o.created_at && o.created_at >= startOfToday),
        );

        setMetrics(metricsPayload);

        // ---- Get KPI targets from kpis table ----
        const kpisData = kpisRes.data || [];
        const kpiTargetsByEmployee: Record<string, { kpi_thang?: number | null; kpi_tuan?: number | null; kpi_ngay?: number | null; bo_phan?: string | null }> = {};
        kpisData.forEach((kpi: any) => {
          kpiTargetsByEmployee[kpi.ho_ten] = {
            kpi_thang: kpi.kpi_thang,
            kpi_tuan: kpi.kpi_tuan,
            kpi_ngay: kpi.kpi_ngay,
            bo_phan: kpi.bo_phan,
          };
        });

        // ---- Employees KPI (client-side aggregation; using date range dataset) ----
        // Calculate date ranges for different periods
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const kpis: EmployeeKPI[] = employees.map((e: any) => {
          const empLeads = leads.filter((l: any) => l.assigned_sales_id === e.id);
          const empOrders = orders.filter((o: any) => o.sales_employee_id === e.id && o.status !== 'cancelled');
          const totalRevenue = empOrders.reduce((acc: number, o: any) => acc + Number(o.final_amount || 0), 0);
          
          // Calculate revenue for different periods
          const todayRevenue = empOrders
            .filter((o: any) => o.created_at && new Date(o.created_at) >= today)
            .reduce((acc: number, o: any) => acc + Number(o.final_amount || 0), 0);
          
          const weekRevenue = empOrders
            .filter((o: any) => o.created_at && new Date(o.created_at) >= startOfWeek)
            .reduce((acc: number, o: any) => acc + Number(o.final_amount || 0), 0);
          
          const monthRevenue = empOrders
            .filter((o: any) => o.created_at && new Date(o.created_at) >= startOfMonth)
            .reduce((acc: number, o: any) => acc + Number(o.final_amount || 0), 0);
          
          // Get KPI targets from kpis table
          const kpiTargets = kpiTargetsByEmployee[e.full_name] || {};
          
          // Calculate progress based on selected period
          let target = 0;
          let revenue = 0;
          let progressPercent = 0;
          
          if (progressPeriod === 'ngay') {
            target = kpiTargets.kpi_ngay ? Number(kpiTargets.kpi_ngay) : 0;
            revenue = todayRevenue;
          } else if (progressPeriod === 'tuan') {
            target = kpiTargets.kpi_tuan ? Number(kpiTargets.kpi_tuan) : 0;
            revenue = weekRevenue;
          } else { // thang
            target = kpiTargets.kpi_thang ? Number(kpiTargets.kpi_thang) : 0;
            revenue = monthRevenue;
          }
          
          progressPercent = target > 0 ? Math.round((revenue / target) * 100) : 0;
          
          const leadsCount = empLeads.length;
          const ordersCount = empOrders.length;

          return {
            id: e.id,
            name: e.full_name,
            employee_code: e.employee_code,
            leads: leadsCount,
            orders: ordersCount,
            avgProcessingTime: 0,
            conversionRate: leadsCount > 0 ? Math.round((ordersCount / leadsCount) * 100) : 0,
            cskh: 0,
            revenue: totalRevenue, // Keep total revenue for display
            target,
            progressPercent,
            kpi_thang: kpiTargets.kpi_thang,
            kpi_tuan: kpiTargets.kpi_tuan,
            kpi_ngay: kpiTargets.kpi_ngay,
            bo_phan: kpiTargets.bo_phan,
          };
        });

        setEmployeeKPIs(kpis);

        // ---- Ranking ----
        const sortedByRevenue = [...kpis].sort((a, b) => b.revenue - a.revenue);
        setRanking({
          top3: sortedByRevenue.slice(0, 3),
          bottom3: [...sortedByRevenue].reverse().slice(0, 3),
        });

        // ---- Chart data (daily leads/orders based on date range + 3-day MA) ----
        const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

        const countsByDay: Record<string, { leads: number; orders: number }> = {};
        for (const l of leads) {
          if (!l.created_at) continue;
          const k = dayKey(l.created_at);
          countsByDay[k] ||= { leads: 0, orders: 0 };
          countsByDay[k].leads += 1;
        }
        for (const o of orders) {
          if (!o.created_at) continue;
          const k = dayKey(o.created_at);
          countsByDay[k] ||= { leads: 0, orders: 0 };
          countsByDay[k].orders += 1;
        }

        // Build continuous date range based on filter
        const dates: string[] = [];
        const startDate = new Date(dateRange.fromDateStr);
        const endDate = new Date(dateRange.toDateStr);
        const currentDate = new Date(startDate);
        
        while (currentDate <= endDate) {
          dates.push(currentDate.toISOString().slice(0, 10));
          currentDate.setDate(currentDate.getDate() + 1);
        }

        const series = dates.map((d) => ({
          name: d.slice(5), // MM-DD
          date: d,
          leads: countsByDay[d]?.leads || 0,
          orders: countsByDay[d]?.orders || 0,
          leadMA: 0,
          orderMA: 0,
        }));

        const ma3 = (arr: number[], idx: number) => {
          const start = Math.max(0, idx - 2);
          const slice = arr.slice(start, idx + 1);
          const sum = slice.reduce((a, b) => a + b, 0);
          return slice.length ? Math.round((sum / slice.length) * 10) / 10 : 0;
        };

        const leadArr = series.map((p) => p.leads);
        const orderArr = series.map((p) => p.orders);
        const withMA = series.map((p, idx) => ({
          ...p,
          leadMA: ma3(leadArr, idx),
          orderMA: ma3(orderArr, idx),
        }));

        setChartData(withMA);

        writeCache(cacheKey, {
          metrics: metricsPayload,
          employeeKPIs: kpis,
          chartData: withMA,
          ranking: {
            top3: sortedByRevenue.slice(0, 3),
            bottom3: [...sortedByRevenue].reverse().slice(0, 3),
          },
        });
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [fromDate, toDate, quickFilter, progressPeriod]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}p`;
    return `${m}p`;
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterSales([]);
    setQuickFilter('');
    setFromDate('');
    setToDate('');
    setFilterStatus([]);
    setFilterDepartment([]);
    setShowAdvancedFilters(false);
  };
  
  const hasActiveFilters = searchQuery || filterSales.length > 0 || quickFilter || fromDate || toDate || filterStatus.length > 0 || filterDepartment.length > 0;

  // Filter employee KPIs
  const filteredKPIs = useMemo(() => {
    return employeeKPIs.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employee_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSales = filterSales.length > 0 ? filterSales.includes(emp.name) : true;
      return matchesSearch && matchesSales;
    });
  }, [employeeKPIs, searchQuery, filterSales]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-slate-500">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-screen overflow-y-auto flex flex-col pb-20">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
          <BarChart3 size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Báo cáo KPIs</h2>
          <p className="text-slate-500 text-sm">Tổng quan hiệu suất Sales & CSKH</p>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 space-y-4">
        {/* Dòng 1: Tất cả các filter cùng hàng */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Quick Filter Dropdown */}
          <div className="relative" ref={quickFilterRef}>
            <button
              onClick={() => setIsQuickFilterOpen(!isQuickFilterOpen)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
                quickFilter
                  ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Calendar size={16} />
              <span className="whitespace-nowrap">
                {quickFilter 
                  ? (quickFilter.startsWith('month-') 
                      ? `Tháng ${quickFilter.split('-')[1]}`
                      : quickFilter === 'today' ? 'Hôm nay' :
                        quickFilter === 'yesterday' ? 'Hôm qua' :
                        quickFilter === 'thisWeek' ? 'Tuần này' :
                        quickFilter === 'lastWeek' ? 'Tuần trước' :
                        quickFilter === 'thisMonth' ? 'Tháng này' : 'Lọc nhanh')
                  : 'Lọc nhanh'}
              </span>
              <ChevronDown 
                size={16} 
                className={`text-slate-400 transition-transform ${isQuickFilterOpen ? 'rotate-180' : ''}`}
              />
            </button>
            
            {isQuickFilterOpen && (
              <div className="absolute z-50 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                <div className="p-2 bg-slate-50 border-b border-slate-100 sticky top-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Chọn thời gian</span>
                </div>
                <div className="p-1">
                  {[
                    { label: 'Hôm nay', value: 'today' },
                    { label: 'Hôm qua', value: 'yesterday' },
                    { label: 'Tuần này', value: 'thisWeek' },
                    { label: 'Tuần trước', value: 'lastWeek' },
                    { label: 'Tháng này', value: 'thisMonth' },
                  ].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => {
                        setQuickFilter(quickFilter === item.value ? '' : item.value);
                        setIsQuickFilterOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition-colors text-sm ${
                        quickFilter === item.value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                  <div className="border-t border-slate-200 mt-1 pt-1">
                    <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase">Theo tháng</div>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <button
                        key={`month-${month}`}
                        onClick={() => {
                          setQuickFilter(quickFilter === `month-${month}` ? '' : `month-${month}`);
                          setIsQuickFilterOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 transition-colors text-sm ${
                          quickFilter === `month-${month}` ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                        }`}
                      >
                        Tháng {month}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Date Range */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Từ ngày:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setQuickFilter(''); // Clear quick filter when manual date is selected
              }}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">Tới ngày:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setQuickFilter(''); // Clear quick filter when manual date is selected
              }}
              min={fromDate}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Bộ Lọc Label */}
          <div className="flex items-center gap-2 ml-auto">
            <Filter size={18} className="text-slate-600" />
            <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">Bộ Lọc:</span>
          </div>

          {/* MultiSelect Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="w-[180px]">
              <MultiSelect
                label="NV Sale"
                options={employeeKPIs.map(e => e.name)}
                selectedValues={filterSales}
                onChange={setFilterSales}
              />
            </div>
            <div className="w-[150px]">
              <MultiSelect
                label="Trạng thái"
                options={['Đã chốt', 'Đang xử lý', 'Hoàn thành', 'Đã hủy']}
                selectedValues={filterStatus}
                onChange={setFilterStatus}
              />
            </div>
            <div className="w-[150px]">
              <MultiSelect
                label="Phòng ban"
                options={['Sales', 'CSKH', 'Marketing', 'Kế toán']}
                selectedValues={filterDepartment}
                onChange={setFilterDepartment}
              />
            </div>
            <div className="relative w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Nút xóa bộ lọc */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              <X size={16} />
              Xóa bộ lọc
            </button>
          )}
        </div>

        {/* Dòng 3: Bộ đếm */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 border-t border-slate-200 pt-4">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 uppercase font-semibold">Số Lead</span>
              <span className="text-xl font-bold text-slate-800">{metrics.leads.total}</span>
            </div>
            <div className="flex flex-col border-l pl-6 border-slate-100">
              <span className="text-xs text-slate-500 uppercase font-semibold">Số đơn (Đã chốt)</span>
              <span className="text-xl font-bold text-blue-600">{metrics.orders.total}</span>
            </div>
            <div className="flex flex-col border-l pl-6 border-slate-100">
              <span className="text-xs text-slate-500 uppercase font-semibold">Doanh số</span>
              <span className="text-xl font-bold text-green-600">{formatCurrency(metrics.revenue.total)}</span>
            </div>
            <div className="flex flex-col border-l pl-6 border-slate-100">
              <span className="text-xs text-slate-500 uppercase font-semibold">CSKH</span>
              <span className="text-xl font-bold text-orange-500">{metrics.cskh.total}</span>
            </div>
          </div>
        )}
      </div>

      {/* Charts & Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
        {/* MACD Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px]">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-slate-700">Tương quan Lead & Đơn hàng (MACD)</h3>
            <p className="text-xs text-slate-500 mt-1">2 đường di chuyển và cắt nhau theo thời gian</p>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#cbd5e1' }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={{ stroke: '#cbd5e1' }} />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  backgroundColor: 'white'
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="line" />
              <Line type="monotone" dataKey="leads" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" opacity={0.6} name="Số Lead" />
              <Line type="monotone" dataKey="orders" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" opacity={0.6} name="Số Đơn" />
              <Line type="monotone" dataKey="leadMA" stroke="#ef4444" strokeWidth={3} dot={{ fill: '#ef4444', r: 5 }} name="Lead MA (3 ngày)" />
              <Line type="monotone" dataKey="orderMA" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} name="Đơn MA (3 ngày)" />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="2 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Ranking */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px] flex flex-col">
          <h3 className="text-lg font-bold mb-4 text-slate-700">Xếp hạng nhân viên</h3>
          <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
            {/* Top 3 */}
            <div className="bg-yellow-50/50 rounded-lg p-3 border border-yellow-100 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3 text-yellow-700 font-bold text-sm uppercase">
                <Trophy size={16} /> Top 3 Xuất Sắc
              </div>
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                {ranking.top3.map((sale, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-2 rounded shadow-sm border border-yellow-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white
                        ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : 'bg-amber-700'}`}>
                        {idx + 1}
                      </div>
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[70px]">{sale.name}</span>
                    </div>
                    <span className="text-[10px] font-bold text-green-600">{formatCurrency(sale.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom 3 */}
            <div className="bg-red-50/50 rounded-lg p-3 border border-red-100 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3 text-red-700 font-bold text-sm uppercase">
                <TrendingDown size={16} /> Cần Cố Gắng
              </div>
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                {ranking.bottom3.map((sale, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-2 rounded shadow-sm border border-red-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center">
                        <User size={12} className="text-slate-500" />
                      </div>
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[70px]">{sale.name}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">{formatCurrency(sale.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Employee KPI Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <Target className="text-blue-600" size={20} />
            <h3 className="text-lg font-bold text-slate-800">Bảng nhân viên các thông số</h3>
          </div>
          <div className="flex items-center gap-3">
            {/* Progress Period Selector */}
            <div className="relative" ref={progressPeriodRef}>
              <button
                onClick={() => setIsProgressPeriodOpen(!isProgressPeriodOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors"
              >
                <span className="text-slate-700">
                  Tiến độ: {progressPeriod === 'ngay' ? 'Ngày' : progressPeriod === 'tuan' ? 'Tuần' : 'Tháng'}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform ${isProgressPeriodOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isProgressPeriodOpen && (
                <div className="absolute right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => {
                      setProgressPeriod('ngay');
                      setIsProgressPeriodOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                      progressPeriod === 'ngay' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    Theo Ngày
                  </button>
                  <button
                    onClick={() => {
                      setProgressPeriod('tuan');
                      setIsProgressPeriodOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                      progressPeriod === 'tuan' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    Theo Tuần
                  </button>
                  <button
                    onClick={() => {
                      setProgressPeriod('thang');
                      setIsProgressPeriodOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 rounded-b-lg ${
                      progressPeriod === 'thang' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    Theo Tháng
                  </button>
                </div>
              )}
            </div>
            <button className="text-slate-400 hover:text-slate-600">
              <MoreVertical size={20} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white text-slate-600 text-xs uppercase font-bold border-b border-slate-200">
                <th className="p-4 border-r border-slate-100 w-[15%]">Sale</th>
                <th className="p-4 text-center border-r border-slate-100 w-[10%]">Số Lead</th>
                <th className="p-4 text-center border-r border-slate-100 w-[10%]">Số đơn</th>
                <th className="p-4 text-center border-r border-slate-100 w-[10%]">Thời gian TB</th>
                <th className="p-4 text-center border-r border-slate-100 w-[10%]">Tỉ lệ chốt</th>
                <th className="p-4 text-center border-r border-slate-100 w-[10%]">CSKH</th>
                <th className="p-4 text-right border-r border-slate-100 w-[15%]">Doanh số</th>
                <th className="p-4 w-[20%]">Tiến độ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredKPIs.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-medium text-slate-800 border-r border-slate-100">
                    {emp.name}
                    <div className="text-[10px] text-slate-400 font-normal">Mã: {emp.employee_code}</div>
                  </td>
                  <td className="p-4 text-center text-slate-600 border-r border-slate-100 bg-slate-50/30">
                    {emp.leads}
                  </td>
                  <td className="p-4 text-center font-bold text-blue-600 border-r border-slate-100 bg-blue-50/20">
                    {emp.orders}
                  </td>
                  <td className="p-4 text-center border-r border-slate-100 text-slate-600">
                    <div className="flex items-center justify-center gap-1">
                      <Clock size={14} className="text-slate-400" />
                      <span>{formatTime(emp.avgProcessingTime)}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center border-r border-slate-100">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold border
                      ${emp.conversionRate >= 30
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : emp.conversionRate >= 20
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {emp.conversionRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="p-4 text-center text-slate-600 border-r border-slate-100">
                    <div className="flex flex-col items-center">
                      <span className="font-bold text-orange-500">{emp.cskh}</span>
                      <span className="text-[10px] text-slate-400">phản hồi</span>
                    </div>
                  </td>
                  <td className="p-4 text-right font-medium text-green-600 border-r border-slate-100">
                    {formatCurrency(emp.revenue)}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                        <span>{emp.progressPercent}%</span>
                        <span>Mục tiêu: {emp.target > 0 ? formatCurrency(emp.target).replace('₫', '') : 'Chưa đặt'}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500
                            ${emp.progressPercent >= 100 ? 'bg-green-500' : emp.progressPercent >= 50 ? 'bg-blue-500' : 'bg-orange-500'}`}
                          style={{ width: `${Math.min(100, emp.progressPercent)}%` }}
                        />
                      </div>
                      {(() => {
                        const kpiValue = progressPeriod === 'ngay' ? emp.kpi_ngay : 
                                        progressPeriod === 'tuan' ? emp.kpi_tuan : 
                                        emp.kpi_thang;
                        const periodLabel = progressPeriod === 'ngay' ? 'ngày' : 
                                          progressPeriod === 'tuan' ? 'tuần' : 
                                          'tháng';
                        return kpiValue && (
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            KPI: {formatCurrency(kpiValue).replace('₫', '')}/{periodLabel}
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
