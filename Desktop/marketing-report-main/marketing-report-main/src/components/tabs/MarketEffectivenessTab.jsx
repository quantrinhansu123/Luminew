import { useMemo } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  ChartDataLabels
);

export function MarketEffectivenessTab({ data, filters }) {
  // Helper functions
  const formatNumber = (num) => {
    return num ? num.toLocaleString('vi-VN') : '0';
  };

  const formatCurrency = (num) => {
    return num ? num.toLocaleString('vi-VN') + 'đ' : '0đ';
  };

  const formatPercent = (num) => {
    return (num * 100).toFixed(2) + '%';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN');
  };

  const formatShort = (value) => {
    if (value >= 1000000000) return (value / 1000000000).toFixed(1) + ' tỷ';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + ' tr';
    if (value >= 1000) return (value / 1000).toFixed(1) + ' k';
    return value.toFixed(0);
  };

  // Market grouping
  const getMarketGroup = (market) => {
    const asiaMarkets = ['Việt Nam', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc', 'Singapore', 'Malaysia', 'Thailand', 'Indonesia'];
    return asiaMarkets.includes(market) ? 'Châu Á' : 'Ngoài Châu Á';
  };

  // Calculate market data
  const marketData = useMemo(() => {
    const grouped = {};
    
    data.forEach(item => {
      const key = `${item.product}_${item.market}`;
      if (!grouped[key]) {
        grouped[key] = {
          product: item.product,
          market: item.market,
          cpqc: 0,
          orders: 0,
          revenue: 0,
          mess: 0,
          dsSauHoanHuy: 0,
        };
      }
      
      grouped[key].cpqc += item.cpqc || 0;
      grouped[key].orders += item.orders || 0;
      grouped[key].revenue += item.revenue || 0;
      grouped[key].mess += item.mess_cmt || 0;
      grouped[key].dsSauHoanHuy += item.dsSauShip || 0;
    });
    
    return Object.values(grouped);
  }, [data]);

  const asiaMarketData = useMemo(() => 
    marketData.filter(d => getMarketGroup(d.market) === 'Châu Á'),
    [marketData]
  );
  
  const nonAsiaMarketData = useMemo(() => 
    marketData.filter(d => getMarketGroup(d.market) === 'Ngoài Châu Á'),
    [marketData]
  );

  // Chart colors
  const CHART_COLORS = [
    '#4CAF50', '#2196F3', '#FFC107', '#F44336', '#9C27B0', '#009688',
    '#FF9800', '#795548', '#607D8B', '#E91E63', '#3F51B5', '#8BC34A'
  ];

  // Prepare chart data
  const chartData = useMemo(() => {
    if (marketData.length === 0) {
      return { 
        products: [], 
        cpqcData: [], 
        ordersData: [], 
        revenueData: [], 
        messData: [], 
        cpsData: [], 
        closingRateData: [] 
      };
    }

    // Group by product
    const productMap = {};
    marketData.forEach(data => {
      if (!productMap[data.product]) {
        productMap[data.product] = {
          cpqc: 0,
          orders: 0,
          revenue: 0,
          mess: 0,
        };
      }
      productMap[data.product].cpqc += data.cpqc;
      productMap[data.product].orders += data.orders;
      productMap[data.product].revenue += data.revenue;
      productMap[data.product].mess += data.mess;
    });

    // Sort by revenue descending
    const sortedProducts = Object.entries(productMap)
      .sort((a, b) => b[1].revenue - a[1].revenue);

    return {
      products: sortedProducts.map(([name]) => name),
      cpqcData: sortedProducts.map(([, data]) => data.cpqc),
      ordersData: sortedProducts.map(([, data]) => data.orders),
      revenueData: sortedProducts.map(([, data]) => data.revenue),
      messData: sortedProducts.map(([, data]) => data.mess),
      cpsData: sortedProducts.map(([, data]) => data.orders > 0 ? data.cpqc / data.orders : 0),
      closingRateData: sortedProducts.map(([, data]) => data.mess > 0 ? (data.orders / data.mess) * 100 : 0)
    };
  }, [marketData]);

  // Chart options
  const horizontalBarOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      datalabels: {
        display: true,
        anchor: 'end',
        align: 'end',
        formatter: (value) => formatShort(value),
        color: '#333',
        font: {
          weight: 'bold',
          size: 11,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          display: false,
        },
      },
      y: {
        grid: {
          display: false,
        },
      },
    },
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          padding: 15,
          font: {
            size: 12,
          },
        },
      },
      datalabels: {
        display: true,
        formatter: (value, ctx) => {
          const sum = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          const percentage = ((value / sum) * 100).toFixed(1);
          return percentage + '%';
        },
        color: '#fff',
        font: {
          weight: 'bold',
          size: 12,
        },
      },
    },
  };

  // Market table component
  const MarketTable = ({ title, tableData, bgClass }) => (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className={`${bgClass} px-6 py-4`}>
        <h3 className="text-xl font-bold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
              <thead className="bg-secondary">
            <tr>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">Sản phẩm</th>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">Thị trường</th>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">CPQC</th>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">Số đơn</th>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">Doanh số</th>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">CPS</th>
              <th className="px-6 py-3 text-center text-xs font-normal text-white uppercase tracking-wider border border-gray-400">%CP/DS</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tableData.map((row, index) => {
              const cps = row.orders ? row.cpqc / row.orders : 0;
              const cpds = row.revenue ? row.cpqc / row.revenue : 0;
              
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-normal text-gray-900 border border-gray-300">{row.product}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-normal text-gray-900 border border-gray-300">{row.market}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-normal text-gray-900 text-right border border-gray-300">{formatCurrency(row.cpqc)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-normal text-gray-900 text-right border border-gray-300">{formatNumber(row.orders)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-normal text-gray-900 text-right border border-gray-300">{formatCurrency(row.revenue)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-normal text-gray-900 text-center border border-gray-300">{formatCurrency(cps)}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-normal text-center border border-gray-300 ${
                    cpds > 0.33 ? 'bg-yellow-100 text-yellow-800' : 'text-gray-900'
                  }`}>
                    {formatPercent(cpds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <h2 className="text-2xl font-bold text-gray-800">THỐNG KÊ HIỆU QUẢ MARKETING THEO SẢN PHẨM & THỊ TRƯỜNG</h2>
        <p className="text-gray-600 mt-2">
          {filters.startDate && filters.endDate && 
            `Từ ${formatDate(filters.startDate)} đến ${formatDate(filters.endDate)}`
          }
        </p>
      </div>

      {/* Non-Asia Market Table */}
      {nonAsiaMarketData.length > 0 && (
        <MarketTable 
          title="THỊ TRƯỜNG NGOÀI CHÂU Á" 
          tableData={nonAsiaMarketData}
          bgClass="bg-primary"
        />
      )}

      {/* Asia Market Table */}
      {asiaMarketData.length > 0 && (
        <MarketTable 
          title="THỊ TRƯỜNG CHÂU Á" 
          tableData={asiaMarketData}
          bgClass="bg-secondary"
        />
      )}

      {/* Charts Grid */}
      {chartData.products.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Doanh số theo sản phẩm</h3>
            <div style={{ height: '400px' }}>
              <Bar
                data={{
                  labels: chartData.products,
                  datasets: [{
                    data: chartData.revenueData,
                    backgroundColor: CHART_COLORS,
                  }]
                }}
                options={horizontalBarOptions}
              />
            </div>
          </div>

          {/* Revenue Pie */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Tỷ lệ doanh số</h3>
            <div style={{ height: '400px' }}>
              <Pie
                data={{
                  labels: chartData.products,
                  datasets: [{
                    data: chartData.revenueData,
                    backgroundColor: CHART_COLORS,
                  }]
                }}
                options={pieOptions}
              />
            </div>
          </div>

          {/* Orders Chart */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Số đơn theo sản phẩm</h3>
            <div style={{ height: '400px' }}>
              <Bar
                data={{
                  labels: chartData.products,
                  datasets: [{
                    data: chartData.ordersData,
                    backgroundColor: CHART_COLORS,
                  }]
                }}
                options={horizontalBarOptions}
              />
            </div>
          </div>

          {/* CPQC Chart */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Chi phí quảng cáo theo sản phẩm</h3>
            <div style={{ height: '400px' }}>
              <Bar
                data={{
                  labels: chartData.products,
                  datasets: [{
                    data: chartData.cpqcData,
                    backgroundColor: CHART_COLORS,
                  }]
                }}
                options={horizontalBarOptions}
              />
            </div>
          </div>
        </div>
      )}

      {marketData.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">Không có dữ liệu phù hợp với bộ lọc</p>
        </div>
      )}
    </div>
  );
}
