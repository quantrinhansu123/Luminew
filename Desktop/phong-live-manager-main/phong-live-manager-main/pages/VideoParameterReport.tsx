import React, { useState, useMemo, useEffect } from 'react';
import { MOCK_VIDEO_METRICS, MOCK_STORES, fetchVideoMetrics, fetchStores, fetchPersonnel, createVideoMetric, updateVideoMetric, deleteVideoMetric } from '../services/dataService';
import { VideoMetric, Store } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { exportToExcel, importFromExcel } from '../utils/excelUtils';
import { formatCurrency, parseCurrency, parsePercentage, formatPercentage, formatCurrencyForExcel } from '../utils/formatUtils';
import { VideoEditModal } from '../components/VideoEditModal';
import { FilterBar } from '../components/FilterBar';
import { isPartner, getPartnerId, isAdmin, getCurrentUserName, isRegularEmployee, isVideoUploader } from '../utils/permissionUtils';

export const VideoParameterReport: React.FC = () => {
  const [videos, setVideos] = useState<VideoMetric[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [personnelList, setPersonnelList] = useState<any[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<VideoMetric | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  // Filter states
  const [searchText, setSearchText] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth.toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>(today.toISOString().split('T')[0]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      let [videoData, storeData, personnelData] = await Promise.all([
        fetchVideoMetrics(),
        fetchStores(),
        fetchPersonnel()
      ]);

      // Admin: xem tất cả (Admin: see all)
      if (isAdmin()) {
        // No filtering needed
      }
      // Người tải lên (Media/TRỢ LIVE 中控): xem tất cả video (Video uploader: see all videos)
      else if (isVideoUploader()) {
        // No filtering needed - người import Excel thấy tất cả
      }
      // Đối tác: chỉ xem video của cửa hàng được gán (Partner: only see assigned stores' videos)
      else if (isPartner()) {
        const partnerId = getPartnerId();
        if (partnerId) {
          storeData = storeData.filter(s => s.partnerId === partnerId);
          const allowedStoreIds = storeData.map(s => s.id);
          videoData = videoData.filter(v => allowedStoreIds.includes(v.storeId));
        }
      }
      // Nhân sự thường: xem video mình upload HOẶC video của cửa hàng mình phụ trách
      // (Regular employee: see videos they uploaded OR videos from stores they manage)
      else if (isRegularEmployee()) {
        const currentUserName = getCurrentUserName();
        if (currentUserName) {
          // Tìm personnel record của user hiện tại
          const currentPersonnel = personnelData.find(p =>
            p.fullName === currentUserName || p.email === currentUserName
          );

          if (currentPersonnel) {
            // Tìm các cửa hàng mà nhân sự này phụ trách
            const managedStoreIds = storeData
              .filter(store =>
                store.personnelIds &&
                store.personnelIds.includes(currentPersonnel.id || currentPersonnel.fullName)
              )
              .map(store => store.id);

            // Filter: video mình upload HOẶC video từ cửa hàng mình phụ trách
            videoData = videoData.filter(v =>
              v.personInCharge === currentUserName || // Video mình upload
              managedStoreIds.includes(v.storeId)     // Video từ cửa hàng mình quản lý
            );
          } else {
            // Nếu không tìm thấy personnel record, chỉ hiển thị video mình upload
            videoData = videoData.filter(v => v.personInCharge === currentUserName);
          }
        }
      }

      // Fallback to mock data if DB is empty
      if (videoData.length === 0) {
        console.warn("Using Mock Data because DB returned empty");
        setVideos(MOCK_VIDEO_METRICS);
      } else {
        setVideos(videoData);
      }
      setStores(storeData.length > 0 ? storeData : MOCK_STORES);
      setPersonnelList(personnelData);
    } catch (error) {
      console.error('Error loading data:', error);
      setVideos(MOCK_VIDEO_METRICS);
      setStores(MOCK_STORES);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredVideos = useMemo(() => {
    let filtered = videos;

    // Filter by date range
    filtered = filtered.filter(v => {
      const videoDate = new Date(v.uploadDate);
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      return videoDate >= fromDate && videoDate <= toDate;
    });

    // Filter by store
    if (selectedFilters.stores && selectedFilters.stores.length > 0) {
      filtered = filtered.filter(v => selectedFilters.stores.includes(v.storeId));
    }

    // Search filter
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(v => {
        const storeName = stores.find(s => s.id === v.storeId)?.name || '';
        return (
          v.title.toLowerCase().includes(searchLower) ||
          v.platform.toLowerCase().includes(searchLower) ||
          v.personInCharge.toLowerCase().includes(searchLower) ||
          (v.host && v.host.toLowerCase().includes(searchLower)) ||
          v.uploadDate.includes(searchLower) ||
          storeName.toLowerCase().includes(searchLower) ||
          v.views.toString().includes(searchLower) ||
          v.sales.toString().includes(searchLower)
        );
      });
    }

    return filtered;
  }, [videos, selectedFilters, searchText, stores, dateFrom, dateTo]);

  const handleExportExcel = () => {
    const exportData = filteredVideos.map(video => {
      // Tìm store name: thử tìm theo ID trước, nếu không tìm thấy thì thử tìm theo tên (vì có thể storeId đã được lưu là tên store)
      let storeName = stores.find(s => s.id === video.storeId)?.name || '';
      if (!storeName) {
        // Nếu không tìm thấy theo ID, thử tìm theo tên (case-insensitive)
        const storeByName = stores.find(s => s.name.trim().toLowerCase() === video.storeId.trim().toLowerCase());
        storeName = storeByName?.name || video.storeId || ''; // Nếu vẫn không tìm thấy, dùng storeId (có thể là tên store)
      }

      // Xuất CHÍNH XÁC dữ liệu đã lưu, không tính toán lại
      return {
        '视频名称': video.title,
        '发布时间': video.uploadDate + (video.uploadTime ? ` ${video.uploadTime}` : ''),
        '时长': video.duration || '',
        'GMV': formatCurrencyForExcel(video.sales),
        '直接 GMV': formatCurrencyForExcel(video.directGMV || Math.floor(video.sales * 0.6)),
        '观看人次': video.views,
        '成交件数': video.orders !== undefined ? video.orders : Math.floor(video.sales / 10000),
        '点击率': video.clickRate !== undefined ? formatPercentage(video.clickRate) : '',
        '完播率': video.watchRate !== undefined ? formatPercentage(video.watchRate) : '',
        '新增粉丝数': video.newFollowers !== undefined ? video.newFollowers : Math.floor(video.views / 50),
        '商品 ID': video.productId || video.id,
        'CỬA HÀNG \r\n商店': storeName,
        'NGƯỜI PHỤ TRÁCH\r\n负责人 ': video.personInCharge,
        'HOST \r\n主播配合': video.host || ''
      };
    });
    exportToExcel(exportData, `video-report-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    // Tạo template với dữ liệu mẫu theo đúng format từ hình ảnh
    const today = new Date().toISOString().split('T')[0];
    const templateData = [
      {
        '视频名称': 'Nhà nay có nước giặt mới chị em ơi #aokemeng #nuocgiat #xuhuongtiktok',
        '发布时间': `${today} 12:49`,
        '时长': '37s',
        'GMV': '0₫',
        '直接 GMV': '0₫',
        '观看人次': 19,
        '成交件数': 0,
        '点击率': '10.53%',
        '完播率': '5.26%',
        '新增粉丝数': 0,
        '商品 ID': '1733111651498559203',
        'CỬA HÀNG \n商店': '',
        'NGƯỜI PHỤ TRÁCH\n负责人 ': '',
        'HOST \n主播配合': ''
      },
      {
        '视频名称': 'Nước giặt tưởng đâu nước hoa k á mấy bà #aokemeng #nuocgiat',
        '发布时间': `${today} 11:47`,
        '时长': '28s',
        'GMV': '0₫',
        '直接 GMV': '0₫',
        '观看人次': 23,
        '成交件数': 0,
        '点击率': '0.00%',
        '完播率': '4.35%',
        '新增粉丝数': 0,
        '商品 ID': '1733111651498559203',
        'CỬA HÀNG \r\n商店': '',
        'NGƯỜI PHỤ TRÁCH\r\n负责人 ': '',
        'HOST \r\n主播配合': ''
      },
      {
        '视频名称': 'Nước giặt 5in1 thì khỏi bàn về độ tiện lợi mấy bà ơi #aokemeng #nuocgiat #xuhuongtiktok',
        '发布时间': `${today} 11:18`,
        '时长': '32s',
        'GMV': '0₫',
        '直接 GMV': '0₫',
        '观看人次': 71,
        '成交件数': 0,
        '点击率': '2.82%',
        '完播率': '1.41%',
        '新增粉丝数': 0,
        '商品 ID': '1733111651498559203',
        'CỬA HÀNG \r\n商店': '',
        'NGƯỜI PHỤ TRÁCH\r\n负责人 ': '',
        'HOST \r\n主播配合': ''
      },
      {
        '视频名称': 'Cứu tinh cho chị em giặt tay nè #aokemeng #nuocgiat #xuhuongtiktok',
        '发布时间': `${today} 11:16`,
        '时长': '20s',
        'GMV': '0₫',
        '直接 GMV': '0₫',
        '观看人次': 92,
        '成交件数': 0,
        '点击率': '2.17%',
        '完播率': '2.17%',
        '新增粉丝数': 0,
        '商品 ID': '1733111651498559203',
        'CỬA HÀNG \r\n商店': '',
        'NGƯỜI PHỤ TRÁCH\r\n负责人 ': '',
        'HOST \r\n主播配合': ''
      },
      {
        '视频名称': 'Mấy bà ơi vào đây mà xem #aokemeng #nuocgiat #xuhuongtiktok',
        '发布时间': `${today} 09:10`,
        '时长': '21s',
        'GMV': '0₫',
        '直接 GMV': '0₫',
        '观看人次': 103,
        '成交件数': 0,
        '点击率': '3.88%',
        '完播率': '2.91%',
        '新增粉丝数': 0,
        '商品 ID': '1731978720453363427',
        'CỬA HÀNG \r\n商店': '',
        'NGƯỜI PHỤ TRÁCH\r\n负责人 ': '',
        'HOST \r\n主播配合': ''
      }
    ];
    exportToExcel(templateData, `template-video-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleImportExcel = async (file: File) => {
    try {
      console.log('Starting import, file:', file.name, file.type, file.size);
      const data = await importFromExcel(file);
      console.log('Imported data:', data);

      // DEBUG: Show column names from first row
      if (data && data.length > 0) {
        console.log('=== EXCEL COLUMN NAMES ===');
        console.log('Columns:', Object.keys(data[0]));
        console.log('First row data:', data[0]);
      }

      if (!data || data.length === 0) {
        alert('File Excel trống hoặc không có dữ liệu hợp lệ. (Excel文件为空或没有有效数据)');
        return;
      }

      // Map Excel columns to VideoMetric - lưu đầy đủ tất cả thông tin từ Excel
      const newVideosData = data.map((row: any) => {
        // Tìm store name - GIỮ NGUYÊN tên từ Excel
        // Excel dùng \r\n (Windows line break)
        const storeName = row['CỬA HÀNG \r\n商店'] ||
          row['CỬA HÀNG \n商店'] ||
          row['CỬA HÀNG\n商店'] ||
          row['CỬA HÀNG 商店'] ||
          row['CỬA HÀNG'] ||
          row['商店'] ||
          '';

        // Tìm store theo tên chính xác
        let storeId = 'unknown';
        if (storeName) {
          const store = stores.find(s => s.name.trim().toLowerCase() === storeName.trim().toLowerCase());
          if (store) {
            storeId = store.id;
          } else {
            // Nếu không tìm thấy store, giữ nguyên tên làm ID tạm
            storeId = storeName;
          }
        }

        // Parse uploadDate và uploadTime - GIỮ NGUYÊN format từ Excel
        let uploadDateFull = row['发布时间'] || '';
        let uploadDate = '';
        let uploadTime = '';

        if (uploadDateFull && uploadDateFull.includes(' ')) {
          // Format: "2026-01-02 12:49"
          const parts = uploadDateFull.split(' ');
          uploadDate = parts[0]; // "2026-01-02"
          uploadTime = parts[1]; // "12:49"
        } else if (uploadDateFull) {
          uploadDate = uploadDateFull;
        } else {
          uploadDate = new Date().toISOString().split('T')[0];
        }

        // Parse person in charge - GIỮ NGUYÊN giá trị từ Excel, KHÔNG dùng default
        // Excel dùng \r\n (Windows line break) và có dấu cách ở cuối
        const personInCharge = row['NGƯỜI PHỤ TRÁCH\r\n负责人 '] ||
          row['NGƯỜI PHỤ TRÁCH\n负责人 '] ||
          row['NGƯỜI PHỤ TRÁCH\n负责人'] ||
          row['NGƯỜI PHỤ TRÁCH 负责人'] ||
          row['NGƯỜI PHỤ TRÁCH'] ||
          row['负责人'] ||
          row['负责人 '] ||
          '';

        // Parse title
        const title = row['视频名称'] || '';

        // Parse duration - GIỮ NGUYÊN format từ Excel (ví dụ: "37s", "2m30s")
        const duration = row['时长'] || '';

        // Parse GMV
        const gmvStr = row['GMV'] || '0';
        const sales = parseCurrency(gmvStr);

        // Parse 直接 GMV
        const directGMVStr = row['直接 GMV'] || '0';
        const directGMV = parseCurrency(directGMVStr);

        // Parse views
        const views = parseInt(row['观看人次'] || '0') || 0;

        // Parse orders (成交件数)
        const orders = parseInt(row['成交件数'] || '0') || 0;

        // Parse click rate (点击率) - từ "10.53%" -> 10.53
        const clickRateStr = row['点击率'] || '0%';
        const clickRate = parsePercentage(clickRateStr);

        // Parse watch rate (完播率) - từ "5.26%" -> 5.26
        const watchRateStr = row['完播率'] || '0%';
        const watchRate = parsePercentage(watchRateStr);

        // Parse new followers
        const newFollowers = parseInt(row['新增粉丝数'] || '0') || 0;

        // Parse product ID
        const productId = row['商品 ID'] ? String(row['商品 ID']) : '';

        // Parse host
        const host = row['HOST \r\n主播配合'] || row['HOST \n主播配合'] || row['HOST'] || '';

        // Default platform là TikTok
        const platform = 'TikTok' as 'TikTok' | 'Facebook' | 'Shopee';

        return {
          storeId: storeId,
          title: title,
          platform: platform,
          uploadDate: uploadDate,
          uploadTime: uploadTime,
          duration: duration,
          personInCharge: personInCharge,
          views: views,
          sales: sales,
          directGMV: directGMV,
          orders: orders,
          clickRate: clickRate,
          watchRate: watchRate,
          newFollowers: newFollowers,
          productId: productId,
          host: host
        };
      }).filter(v => v.title && v.title.trim() !== ''); // Loại bỏ các dòng không có title

      console.log('Processed videos data:', newVideosData);

      if (newVideosData.length === 0) {
        alert('Không tìm thấy dữ liệu video hợp lệ trong file Excel. Vui lòng kiểm tra lại định dạng file. (未在Excel文件中找到有效的视频数据。请检查文件格式。)');
        return;
      }

      // Save each video to database
      let successCount = 0;
      let errorCount = 0;

      for (const videoData of newVideosData) {
        try {
          await createVideoMetric(videoData);
          successCount++;
        } catch (error) {
          console.error('Error saving video:', error);
          errorCount++;
        }
      }

      // Reload data from database
      await loadData();

      if (errorCount > 0) {
        alert(`Đã import ${successCount} video thành công, ${errorCount} video lỗi. (已成功导入${successCount}个视频，${errorCount}个视频出错)`);
      } else {
        alert(`Đã import ${successCount} video từ Excel thành công. (已从Excel成功导入${successCount}个视频)`);
      }
    } catch (error) {
      console.error('Error importing Excel:', error);
      alert('Lỗi khi import Excel (导入Excel时出错): ' + (error as Error).message);
    }
  };

  // KPI Calculation
  const monthlyTarget = 100; // Mock target videos per month
  const currentCount = filteredVideos.length;
  const progressPercent = Math.min((currentCount / monthlyTarget) * 100, 100);

  // Week Total Views Calculation (for charts)
  const totalViewsForCharts = filteredVideos.reduce((sum, v) => sum + v.views, 0);
  const totalSales = filteredVideos.reduce((sum, v) => sum + v.sales, 0);

  // Chart data - Group by date
  const chartData = filteredVideos.reduce((acc: any[], video) => {
    const existing = acc.find(item => item.date === video.uploadDate);
    if (existing) {
      existing.views += video.views;
      existing.sales += video.sales;
      existing.videos += 1;
    } else {
      acc.push({
        date: video.uploadDate,
        views: video.views,
        sales: video.sales,
        videos: 1
      });
    }
    return acc;
  }, []).sort((a, b) => a.date.localeCompare(b.date));

  // Performance by person
  const performanceByPerson = filteredVideos.reduce((acc: any[], video) => {
    const existing = acc.find(item => item.name === video.personInCharge);
    if (existing) {
      existing.views += video.views;
      existing.sales += video.sales;
      existing.videos += 1;
    } else {
      acc.push({
        name: video.personInCharge,
        views: video.views,
        sales: video.sales,
        videos: 1
      });
    }
    return acc;
  }, []).sort((a, b) => b.views - a.views);

  // Handle Edit Video
  const handleEditVideo = (video: VideoMetric) => {
    setEditingVideo(video);
    setIsEditModalOpen(true);
  };

  // Handle Delete Video
  const handleDeleteVideo = async (videoId: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa video này? (确定要删除这个视频吗?)')) {
      try {
        await deleteVideoMetric(videoId);
        await loadData();
        alert('Đã xóa video thành công! (视频已删除!)');
      } catch (error) {
        console.error('Error deleting video:', error);
        alert('Lỗi khi xóa video (删除视频时出错): ' + (error as Error).message);
      }
    }
  };

  // Handle Select/Deselect Video
  const handleToggleVideoSelect = (videoId: string) => {
    setSelectedVideoIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  // Handle Select All / Deselect All
  const handleToggleSelectAll = () => {
    if (selectedVideoIds.size === filteredVideos.length) {
      // Deselect all
      setSelectedVideoIds(new Set());
    } else {
      // Select all
      setSelectedVideoIds(new Set(filteredVideos.map(v => v.id)));
    }
  };

  // Handle Batch Delete
  const handleBatchDelete = async () => {
    if (selectedVideoIds.size === 0) {
      alert('Vui lòng chọn ít nhất một video để xóa. (请至少选择一个视频删除)');
      return;
    }

    const confirmMessage = `Bạn có chắc chắn muốn xóa ${selectedVideoIds.size} video đã chọn? Hành động này không thể hoàn tác. (您确定要删除${selectedVideoIds.size}个已选择的视频吗? 此操作无法撤销。)`;
    if (window.confirm(confirmMessage)) {
      try {
        let successCount = 0;
        let errorCount = 0;

        for (const videoId of selectedVideoIds) {
          try {
            await deleteVideoMetric(videoId);
            successCount++;
          } catch (error) {
            console.error('Error deleting video:', error);
            errorCount++;
          }
        }

        // Clear selection
        setSelectedVideoIds(new Set());

        // Reload data
        await loadData();

        if (errorCount > 0) {
          alert(`Đã xóa ${successCount} video thành công, ${errorCount} video lỗi. (已成功删除${successCount}个视频，${errorCount}个视频出错)`);
        } else {
          alert(`Đã xóa ${successCount} video thành công! (已成功删除${successCount}个视频!)`);
        }
      } catch (error) {
        console.error('Error in batch delete:', error);
        alert('Lỗi khi xóa hàng loạt (批量删除时出错): ' + (error as Error).message);
      }
    }
  };

  // Handle Save Video (Edit or Add)
  const handleSaveVideo = async (videoData: VideoMetric) => {
    try {
      if (editingVideo && videoData.id) {
        // Update existing video
        const { id, ...updateData } = videoData;
        await updateVideoMetric(id, updateData);
        await loadData();
        alert('Đã cập nhật video thành công! (视频已更新!)');
      } else {
        // Add new video
        const { id, ...createData } = videoData;
        await createVideoMetric(createData);
        await loadData();
        alert('Đã thêm video thành công! (视频已添加!)');
      }
      setIsEditModalOpen(false);
      setEditingVideo(undefined);
    } catch (error) {
      console.error('Error saving video:', error);
      alert('Lỗi khi lưu video (保存视频时出错): ' + (error as Error).message);
    }
  };

  // Handle Add New Video
  const handleAddVideo = () => {
    setEditingVideo(undefined);
    setIsEditModalOpen(true);
  };

  // Calculate totals for KPI cards
  const totalVideoCount = filteredVideos.length;
  const totalViews = filteredVideos.reduce((sum, v) => sum + v.views, 0);
  const totalGMV = filteredVideos.reduce((sum, v) => sum + v.sales, 0);

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800 uppercase">Quản lý & Báo cáo Video (视频管理和报告)</h2>
      </div>

      {/* Filter Bar */}
      <FilterBar
        inline={true}
        onSearch={setSearchText}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        onReset={() => {
          setSearchText('');
          setSelectedFilters({});
          const today = new Date();
          const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          setDateFrom(firstDayOfMonth.toISOString().split('T')[0]);
          setDateTo(today.toISOString().split('T')[0]);
        }}
        filterFields={[
          {
            key: 'stores',
            label: 'Cửa hàng',
            type: 'checkbox',
            options: stores.filter(s => s.id !== 'all').map(s => ({ value: s.id, label: s.name }))
          }
        ]}
        selectedFilters={selectedFilters}
        onFilterChange={(field, values) => {
          setSelectedFilters(prev => ({ ...prev, [field]: values }));
        }}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onQuickDateSelect={(from, to) => {
          setDateFrom(from);
          setDateTo(to);
        }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-blue-500">
          <p className="text-xs text-gray-500 uppercase font-bold">TỔNG VIDEO (总视频)</p>
          <p className="text-xl font-bold text-gray-800 mt-1">{totalVideoCount.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-orange-500">
          <p className="text-xs text-gray-500 uppercase font-bold">TỔNG LƯỢT XEM (总浏览量)</p>
          <p className="text-xl font-bold text-orange-600 mt-1">{totalViews.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded shadow-sm border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase font-bold">TỔNG GMV (总GMV)</p>
          <p className="text-xl font-bold text-green-600 mt-1">{formatCurrency(totalGMV)}</p>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-xs text-gray-500 mb-1">场观总数</h3>
          <p className="text-3xl font-bold text-blue-600">{new Intl.NumberFormat('vi-VN').format(totalViewsForCharts)}</p>
          <p className="text-xs text-gray-400 mt-1">总场观</p>
        </div>

        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-xs text-gray-500 mb-1">新增粉丝数</h3>
          <p className="text-3xl font-bold text-pink-600">{new Intl.NumberFormat('vi-VN').format(Math.floor(totalViewsForCharts / 50))}</p>
          <p className="text-xs text-gray-400 mt-1">粉丝增量</p>
        </div>

        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-xs text-gray-500 mb-1">成交量</h3>
          <p className="text-3xl font-bold text-blue-500">{new Intl.NumberFormat('vi-VN').format(Math.floor(totalSales / 10000))}</p>
          <p className="text-xs text-gray-400 mt-1">总成交</p>
        </div>

        <div className="bg-white p-4 rounded shadow-sm border border-gray-200">
          <h3 className="text-xs text-gray-500 mb-1">GMV</h3>
          <p className="text-3xl font-bold text-orange-600">{new Intl.NumberFormat('vi-VN').format(totalSales)}</p>
          <p className="text-xs text-gray-400 mt-1">总销售额</p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded shadow-sm border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">场观趋势 & 销售数据</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="views" stroke="#3B82F6" strokeWidth={2} name="场观" />
              <Line yAxisId="right" type="monotone" dataKey="sales" stroke="#F59E0B" strokeWidth={2} name="GMV" />
              <Bar yAxisId="left" dataKey="videos" fill="#EC4899" name="视频数" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded shadow-sm border border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-800">主播排行</h3>
          </div>
          <div className="space-y-3">
            {performanceByPerson.slice(0, 10).map((person, index) => {
              const maxViews = performanceByPerson[0]?.views || 1;
              const percentage = (person.views / maxViews) * 100;
              return (
                <div key={index} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-700">{index + 1}. {person.name}</span>
                    <span className="text-blue-600 font-semibold">{new Intl.NumberFormat('vi-VN').format(person.views)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{person.videos} videos</span>
                    <span>GMV: {new Intl.NumberFormat('vi-VN').format(person.sales)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Video List */}
      <div>
        <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold text-gray-800">Danh sách Video & Đánh giá (视频列表和评估) ({filteredVideos.length} bản ghi (条记录))</h3>
              {selectedVideoIds.size > 0 && (
                <span className="text-sm text-blue-600 font-medium">
                  Đã chọn: {selectedVideoIds.size} video (已选择: {selectedVideoIds.size} 个视频)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportExcel}
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition shadow font-medium flex items-center gap-2"
                title="Tải xuống Excel danh sách video (下载视频列表Excel)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Tải Excel (下载Excel)
              </button>
              <label className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition shadow font-medium flex items-center gap-2 cursor-pointer" title="Tải lên Excel danh sách video (上传视频列表Excel)">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        await handleImportExcel(file);
                      } catch (error) {
                        console.error('Import error:', error);
                        alert('Lỗi khi import Excel (导入Excel时出错): ' + (error as Error).message);
                      }
                    }
                    // Reset input để có thể chọn lại file cùng tên
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Tải lên Excel (上传Excel)
              </label>
              <button
                onClick={handleDownloadTemplate}
                className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition shadow font-medium flex items-center gap-2"
                title="Tải mẫu Excel chuẩn (下载标准Excel模板)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Tải mẫu Excel (下载Excel模板)
              </button>
              {selectedVideoIds.size > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition shadow font-medium"
                >
                  Xóa đã chọn ({selectedVideoIds.size}) (删除已选择 ({selectedVideoIds.size}))
                </button>
              )}
              <button
                onClick={handleAddVideo}
                className="bg-brand-navy text-white px-4 py-2 rounded hover:bg-brand-darkNavy transition shadow font-medium"
              >
                + Thêm Video (添加视频)
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Đang tải dữ liệu... (正在加载数据...)</div>
            ) : filteredVideos.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Chưa có video nào (暂无视频)</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-white uppercase bg-brand-navy border-b">
                  <tr>
                    <th className="px-4 py-3 w-12">
                      <input
                        type="checkbox"
                        checked={filteredVideos.length > 0 && selectedVideoIds.size === filteredVideos.length}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 text-brand-navy bg-gray-100 border-gray-300 rounded focus:ring-brand-navy"
                      />
                    </th>
                    <th className="px-4 py-3">视频名称 (Tên video)</th>
                    <th className="px-4 py-3">发布时间 (Ngày đăng)</th>
                    <th className="px-4 py-3">时长 (Thời lượng)</th>
                    <th className="px-4 py-3 text-right">GMV (交易额)</th>
                    <th className="px-4 py-3 text-right">直接 GMV (GMV trực tiếp)</th>
                    <th className="px-4 py-3 text-right">观看人次 (Lượt xem)</th>
                    <th className="px-4 py-3 text-right">成交件数 (Số đơn hàng)</th>
                    <th className="px-4 py-3 text-right">点击率 (Tỉ lệ click)</th>
                    <th className="px-4 py-3 text-right">完播率 (Tỉ lệ xem hết)</th>
                    <th className="px-4 py-3 text-right">新增粉丝数 (Số fan mới)</th>
                    <th className="px-4 py-3">商品 ID (Mã sản phẩm)</th>
                    <th className="px-4 py-3">店铺 (Cửa hàng)</th>
                    <th className="px-4 py-3">负责人 (Người phụ trách)</th>
                    <th className="px-4 py-3">HOST (主播配合)</th>
                    <th className="px-4 py-3 text-center">Hành động (操作)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVideos.map((video) => {
                    const storeName = stores.find(s => s.id === video.storeId)?.name || '';
                    // Evaluation Logic: > 10k views is Green
                    const isGoodPerformance = video.views > 10000;
                    const isSelected = selectedVideoIds.has(video.id);
                    return (
                      <tr key={video.id} className={`border-b hover:bg-gray-50 ${isGoodPerformance ? 'bg-green-50' : ''} ${isSelected ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleVideoSelect(video.id)}
                            className="w-4 h-4 text-brand-navy bg-gray-100 border-gray-300 rounded focus:ring-brand-navy"
                          />
                        </td>
                        <td className="px-4 py-4 font-medium text-gray-900">{video.title}</td>
                        <td className="px-4 py-4 text-gray-600">
                          {video.uploadDate}{video.uploadTime ? ` ${video.uploadTime}` : ''}
                        </td>
                        <td className="px-4 py-4 text-gray-600">{video.duration || '-'}</td>
                        <td className="px-4 py-4 text-right font-bold text-green-600">{video.sales}</td>
                        <td className="px-4 py-4 text-right text-gray-600">{video.directGMV !== undefined ? video.directGMV : ''}</td>
                        <td className="px-4 py-4 text-right font-semibold">{video.views}</td>
                        <td className="px-4 py-4 text-right">{video.orders !== undefined ? video.orders : ''}</td>
                        <td className="px-4 py-4 text-right">{video.clickRate !== undefined ? `${video.clickRate}%` : '-'}</td>
                        <td className="px-4 py-4 text-right">{video.watchRate !== undefined ? `${video.watchRate}%` : '-'}</td>
                        <td className="px-4 py-4 text-right">{video.newFollowers !== undefined ? video.newFollowers : '-'}</td>
                        <td className="px-4 py-4 text-gray-600">{video.productId || '-'}</td>
                        <td className="px-4 py-4 text-gray-600">{storeName}</td>
                        <td className="px-4 py-4 text-gray-600">{video.personInCharge}</td>
                        <td className="px-4 py-4 text-gray-600">{video.host || '-'}</td>
                        <td className="px-4 py-4">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => handleEditVideo(video)}
                              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition text-xs font-medium"
                            >
                              Sửa (编辑)
                            </button>
                            <button
                              onClick={() => handleDeleteVideo(video.id)}
                              className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition text-xs font-medium"
                            >
                              Xóa (删除)
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <VideoEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingVideo(undefined);
        }}
        onSubmit={handleSaveVideo}
        initialData={editingVideo}
      />
    </div>
  );
};