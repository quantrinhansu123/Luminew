import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001; // Backend port (khác với Vite dev server port 3000)

// Middleware
app.use(cors());
app.use(express.json());

// Set default headers to avoid 406 errors
app.use((req, res, next) => {
  // Only set Content-Type for non-OPTIONS requests
  if (req.method !== 'OPTIONS') {
    res.setHeader('Content-Type', 'application/json');
  }
  next();
});

// API URL từ config (giống như trong api.js)
const PROD_HOST = 'https://n-api-gamma.vercel.app';
const SHEET_NAME = 'F3';
const DATA_API_URL = `${PROD_HOST}/sheet/${SHEET_NAME}/data`;

// Supabase configuration (using service role key if available to bypass RLS)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://gsjhsmxyxjyiqovauyrp.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vXBSa3eP8cvjIK2qLWI6Ug_FoYm4CNy';

// Create Supabase client with service role key (bypasses RLS)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Log which key is being used (for debugging)
console.log('🔑 Supabase Admin Client initialized');
console.log('   URL:', SUPABASE_URL);
console.log('   Using Service Role Key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log('   Using Anon Key fallback:', !process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.VITE_SUPABASE_ANON_KEY);

// Mock data fallback
const mockVanDonData = [
  {
    "Mã đơn hàng": "VD001",
    "Ngày lên đơn": "2024-01-15",
    "Name*": "Nguyễn Văn A",
    "Phone*": "0123456789",
    "Khu vực": "Miền Bắc",
    "Mặt hàng": "Sản phẩm A",
    "Mã Tracking": "VN123456789",
    "Trạng thái giao hàng": "ĐANG GIAO",
    "Tổng tiền VNĐ": "1000000",
    "Team": "HCM",
    "Đơn vị vận chuyển": "",
    "Kết quả Check": "OK"
  },
  {
    "Mã đơn hàng": "VD002",
    "Ngày lên đơn": "2024-01-16",
    "Name*": "Trần Thị B",
    "Phone*": "0987654321",
    "Khu vực": "Miền Nam",
    "Mặt hàng": "Sản phẩm B",
    "Mã Tracking": "VN987654321",
    "Trạng thái giao hàng": "ĐÃ GIAO",
    "Tổng tiền VNĐ": "2000000",
    "Team": "Hà Nội",
    "Đơn vị vận chuyển": "",
    "Kết quả Check": "OK"
  }
];

// API Routes
app.get('/van-don', async (req, res) => {
  try {
    console.log('GET /van-don - Request received');
    console.log('Query params:', req.query);

    // Thử fetch từ API thực tế trước
    let data = [];
    try {
      console.log('Fetching from external API:', DATA_API_URL);
      const response = await fetch(DATA_API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const json = await response.json();
        if (json.error) {
          throw new Error(json.error);
        }
        data = json.rows || json.data || json;
        if (!Array.isArray(data)) {
          throw new Error('Dữ liệu trả về không đúng định dạng mảng');
        }
        console.log(`✅ Loaded ${data.length} orders from external API`);
      } else {
        throw new Error(`API Error ${response.status}: ${response.statusText}`);
      }
    } catch (apiError) {
      console.warn('⚠️ External API error, using mock data:', apiError.message);
      data = [...mockVanDonData];
    }

    // Filter by query parameters
    const { page = 1, limit = 100, team, status, market, product } = req.query;

    let filteredData = [...data];

    // Filter by team if provided
    if (team && team !== 'all') {
      filteredData = filteredData.filter(item => item.Team === team);
    }

    // Filter by status if provided
    if (status) {
      filteredData = filteredData.filter(item => item["Trạng thái giao hàng"] === status);
    }

    // Filter by market if provided
    if (market) {
      const marketArray = Array.isArray(market) ? market : (typeof market === 'string' ? [market] : []);
      if (marketArray.length > 0) {
        filteredData = filteredData.filter(item => marketArray.includes(item["Khu vực"]));
      }
    }

    // Filter by product if provided
    if (product) {
      const productArray = Array.isArray(product) ? product : (typeof product === 'string' ? [product] : []);
      if (productArray.length > 0) {
        filteredData = filteredData.filter(item => productArray.includes(item["Mặt hàng"]));
      }
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedData = filteredData.slice(startIndex, endIndex);

    // Set proper headers to avoid 406 error
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Accept', 'application/json');

    res.json({
      success: true,
      data: paginatedData,
      total: filteredData.length,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(filteredData.length / limitNum),
      rows: paginatedData // Alias cho compatibility
    });
  } catch (error) {
    console.error('❌ Error in /van-don:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

// Sync MKT data from Firebase endpoint (bypasses RLS by using service role key)
app.post('/api/sync-mkt', async (req, res) => {
  try {
    const FIREBASE_URL = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Báo_cáo_MKT.json";
    console.log('Fetching MKT data from:', FIREBASE_URL);

    const response = await fetch(FIREBASE_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const dataRaw = await response.json();

    let firebaseData = [];
    if (Array.isArray(dataRaw)) {
      firebaseData = dataRaw;
    } else if (dataRaw && typeof dataRaw === 'object') {
      firebaseData = Object.values(dataRaw);
    }

    if (firebaseData.length === 0) {
      return res.json({ success: false, message: 'Không tìm thấy dữ liệu trên Firebase.' });
    }

    console.log(`Found ${firebaseData.length} records. Processing...`);

    // Helper functions
    const parseNum = (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[^0-9.-]/g, '');
        return parseFloat(cleaned) || 0;
      }
      return 0;
    };

    const getToday = () => {
      const today = new Date();
      return today.toLocaleDateString('en-CA');
    };

    // Transform data
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;
    let lastError = null;

    for (let i = 0; i < firebaseData.length; i += batchSize) {
      const batch = firebaseData.slice(i, i + batchSize);
      const transformedBatch = batch.map((item) => {
        // Parse date
        let dateValue = item['Ngày'] || item['Ngày_lên_đơn'] || getToday();
        if (dateValue && typeof dateValue === 'string') {
          if (dateValue.includes('/')) {
            const parts = dateValue.split('/');
            if (parts.length === 3) {
              const [d, m, y] = parts;
              dateValue = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            }
          }
        }

        const rowData = {
          id: item.id || randomUUID(),
          'Tên': item['Tên'] || item['Name'] || '',
          'Email': item['Email'] || item['email'] || '',
          'Ngày': dateValue,
          ca: item['ca'] || item['Ca'] || '',
          'Sản_phẩm': item['Sản_phẩm'] || item['Sản phẩm'] || '',
          'Thị_trường': item['Thị_trường'] || item['Thị trường'] || '',
          'Team': item['Team'] || item['team'] || 'MKT',
          TKQC: item['TKQC'] || '',
          CPQC: parseNum(item['CPQC']),
          'Số_Mess_Cmt': parseNum(item['Số_Mess_Cmt'] || item['Số Mess Cmt']),
          'Số đơn': parseNum(item['Số đơn'] || item['Số_đơn']),
          'Doanh số': parseNum(item['Doanh số'] || item['Doanh_số']),
          'id_NS': item['id_NS'] || item['id_ns'] || '',
          'Số đơn hoàn hủy': parseNum(item['Số đơn hoàn hủy'] || item['Số_đơn_hoàn_hủy']),
          'DS sau hoàn hủy': parseNum(item['DS sau hoàn hủy'] || item['DS_sau_hoàn_hủy']),
          'Doanh số sau ship': parseNum(item['Doanh số sau ship'] || item['Doanh_số_sau_ship']),
          'Doanh số TC': parseNum(item['Doanh số TC'] || item['Doanh_số_TC']),
          KPIs: parseNum(item['KPIs'] || item['KPI']),
          'CPQC theo TKQC': parseNum(item['CPQC theo TKQC'] || item['CPQC_theo_TKQC']),
          'Báo cáo theo Page': item['Báo cáo theo Page'] || item['Báo_cáo_theo_Page'] || '',
          'Trạng thái': item['Trạng thái'] || item['Trạng_thái'] || '',
          'Cảnh báo': item['Cảnh báo'] || item['Cảnh_báo'] || '',
        };

        const doanhSoDi = parseNum(item['Doanh số đi'] || item['Doanh_số_đi']);
        if (doanhSoDi > 0) {
          rowData['Doanh số đi thực tế'] = doanhSoDi;
        }

        return rowData;
      });

      // Insert using admin client (bypasses RLS)
      console.log(`Processing batch ${i / batchSize + 1}/${Math.ceil(firebaseData.length / batchSize)}...`);
      const { error: upsertError, data: upsertData } = await supabaseAdmin
        .from('detail_reports')
        .upsert(transformedBatch, { onConflict: 'id', ignoreDuplicates: false })
        .select();

      if (upsertError) {
        console.error(`Batch ${i / batchSize + 1} error:`, upsertError);
        // If RLS error, provide helpful message
        if (upsertError.message && upsertError.message.includes('row-level security')) {
          console.error('⚠️ RLS Policy Error: Service role key may not be configured correctly');
          console.error('   Set SUPABASE_SERVICE_ROLE_KEY in .env to bypass RLS');
        }
        errorCount += batch.length;
        lastError = upsertError;
      } else {
        successCount += upsertData ? upsertData.length : batch.length;
        console.log(`✅ Batch ${i / batchSize + 1} success: ${upsertData ? upsertData.length : batch.length} records`);
      }
    }

    res.json({
      success: errorCount === 0,
      successCount,
      errorCount,
      total: firebaseData.length,
      error: lastError ? lastError.message : null
    });

  } catch (error) {
    console.error('Sync MKT error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test Supabase connection
app.get('/api/test-supabase', async (req, res) => {
  try {
    console.log('🧪 Testing Supabase connection...');
    console.log('   URL:', SUPABASE_URL);
    console.log('   Key prefix:', SUPABASE_SERVICE_ROLE_KEY.substring(0, 30) + '...');

    // Simple test query
    const { data, error, count } = await supabaseAdmin
      .from('detail_reports')
      .select('id', { count: 'exact' })
      .limit(1);

    if (error) {
      console.error('❌ Test query error:', error);
      return res.json({
        success: false,
        error: error.message,
        errorDetails: error,
        usingServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
    }

    return res.json({
      success: true,
      message: 'Supabase connection OK',
      recordCount: count,
      usingServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    });
  } catch (error) {
    console.error('❌ Test error:', error);
    return res.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Fetch detail_reports data (bypasses RLS by using service role key)
app.get('/api/fetch-detail-reports', async (req, res) => {
  try {
    const { startDate, endDate, limit = 10000 } = req.query;

    console.log('📥 Fetching detail_reports data...', { startDate, endDate, limit });
    console.log('🔑 Using Supabase URL:', SUPABASE_URL);
    console.log('🔑 Using Service Role Key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY is missing!');
      return res.status(500).json({
        success: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY is not configured. Please set it in .env file.',
        data: []
      });
    }

    console.log('🔑 Key prefix:', SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...');

    // Try selecting all first, then filter in memory if needed
    // Note: Column name "Ngày" has special character, need to use double quotes in PostgREST
    let query = supabaseAdmin
      .from('detail_reports')
      .select('*');

    // Apply date filters if provided
    // Convert date strings to proper format for Supabase DATE comparison
    if (startDate) {
      console.log('📅 Filtering by startDate:', startDate);
      // Ensure date is in YYYY-MM-DD format
      const startDateFormatted = startDate.split('T')[0]; // Remove time if present
      query = query.gte('Ngày', startDateFormatted);
    }
    if (endDate) {
      console.log('📅 Filtering by endDate:', endDate);
      // Ensure date is in YYYY-MM-DD format
      const endDateFormatted = endDate.split('T')[0]; // Remove time if present
      query = query.lte('Ngày', endDateFormatted);
    }

    // Order by date - column name with special character
    query = query.order('Ngày', { ascending: false });

    // Apply limit
    query = query.limit(parseInt(limit));

    console.log('🔍 Executing query...');
    console.log('📋 Query params:', { startDate, endDate, limit });

    try {
      const { data, error } = await query;

      if (error) {
        console.error('❌ Error fetching detail_reports:', error);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        console.error('❌ Full error object:', error);

        // Check if it's an RLS error
        if (error.message && (error.message.includes('row-level security') || error.message.includes('RLS') || error.message.includes('permission denied'))) {
          return res.status(500).json({
            success: false,
            error: `RLS Policy Error: ${error.message}. Please configure SUPABASE_SERVICE_ROLE_KEY in .env file to bypass RLS.`,
            data: [],
            hint: 'The current key may not have permission to bypass RLS. You need a service role key.',
            errorCode: error.code,
            errorMessage: error.message
          });
        }

        // Check if column doesn't exist
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist') || error.message.includes('Ngày'))) {
          return res.status(500).json({
            success: false,
            error: `Column Error: ${error.message}. Please check if column 'Ngày' exists in detail_reports table.`,
            data: [],
            hint: 'The column name might be different. Check your database schema.',
            errorCode: error.code,
            errorMessage: error.message
          });
        }

        return res.status(500).json({
          success: false,
          error: error.message || 'Unknown error',
          errorCode: error.code,
          errorMessage: error.message,
          errorDetails: JSON.stringify(error),
          data: []
        });
      }

      console.log(`✅ Fetched ${data?.length || 0} records from detail_reports`);

      return res.json({
        success: true,
        data: data || [],
        count: data?.length || 0
      });
    } catch (queryError) {
      console.error('❌ Query execution error:', queryError);
      console.error('❌ Query error stack:', queryError.stack);
      return res.status(500).json({
        success: false,
        error: `Query execution failed: ${queryError.message}`,
        errorStack: queryError.stack,
        data: []
      });
    }

  } catch (error) {
    console.error('❌ Fetch detail_reports error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      errorStack: error.stack,
      data: []
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/van-don`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/sync-mkt`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/fetch-detail-reports`);
});

