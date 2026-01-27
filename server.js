import cors from 'cors';
import express from 'express';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001; // Backend port (khác với Vite dev server port 3000)

// Middleware
app.use(cors());
app.use(express.json());

// API URL từ config (giống như trong api.js)
const PROD_HOST = 'https://n-api-gamma.vercel.app';
const SHEET_NAME = 'F3';
const DATA_API_URL = `${PROD_HOST}/sheet/${SHEET_NAME}/data`;

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
    res.status(500).json({
      success: false,
      error: error.message,
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
});

