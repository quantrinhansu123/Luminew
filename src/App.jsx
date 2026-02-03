import { Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import AdminTools from './pages/AdminTools';
import BaoCaoChiTiet from './pages/BaoCaoChiTiet';
import BaoCaoHieuSuatKPI from './pages/BaoCaoHieuSuatKPI';
import BaoCaoMarketing from './pages/BaoCaoMarketing';
import BaoCaoSale from './pages/BaoCaoSale';
import ChangeLogViewer from './pages/ChangeLogViewer';
import DanhSachDon from './pages/DanhSachDon';
import DonChiaCSKH from './pages/DonChiaCSKH';
import F3Report from './pages/F3Report';
import FFM from './pages/FFM';
import FinanceDashboard from './pages/FinanceDashboard';
import HieuQuaMarketing from './pages/HieuQuaMarketing';
import Home from './pages/Home';
import HRDashboard from './pages/HRDashboard';
import KPIReport from './pages/KPIReport';
import LenHSanXuat from './pages/LenHSanXuat';
import Login from './pages/Login';
import NhanSu from './pages/NhanSu';
import NhapDonMoi from './pages/NhapDonMoi';
import Profile from './pages/Profile';
import QuanLyCSKH from './pages/QuanLyCSKH';
import ReportDashboard from './pages/ReportDashboard';
import VanDon from './pages/VanDon';
import XemBaoCaoMKT from './pages/XemBaoCaoMKT';

/* Header component extracted to `src/components/Header.jsx` */

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Header />

        {/* Routes */}
        <Routes>
          <Route path="/dang-nhap" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/trang-chu" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/bao-cao-chi-tiet" element={<ProtectedRoute><BaoCaoChiTiet /></ProtectedRoute>} />
          <Route path="/bang-bao-cao" element={<ProtectedRoute><ReportDashboard /></ProtectedRoute>} />
          <Route path="/bao-cao-kpi" element={<ProtectedRoute><KPIReport /></ProtectedRoute>} />
          <Route path="/hieu-qua-mkt" element={<ProtectedRoute><HieuQuaMarketing /></ProtectedRoute>} />
          <Route path="/bao-cao-marketing" element={<ProtectedRoute><BaoCaoMarketing /></ProtectedRoute>} />
          <Route path="/bao-cao-sale" element={<ProtectedRoute><BaoCaoSale /></ProtectedRoute>} />
          <Route path="/bao-cao-f3" element={<ProtectedRoute><F3Report /></ProtectedRoute>} />
          <Route path="/bao-cao-hieu-suat-kpi" element={<ProtectedRoute><BaoCaoHieuSuatKPI /></ProtectedRoute>} />
          <Route path="/nhan-su" element={<ProtectedRoute><NhanSu /></ProtectedRoute>} />
          <Route path="/hr-dashboard" element={<ProtectedRoute><HRDashboard /></ProtectedRoute>} />
          <Route path="/finance-dashboard" element={<ProtectedRoute><FinanceDashboard /></ProtectedRoute>} />

          <Route path="/ho-so" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/van-don" element={<ProtectedRoute><VanDon /></ProtectedRoute>} />
          <Route path="/danh-sach-don" element={<ProtectedRoute><DanhSachDon /></ProtectedRoute>} />
          <Route path="/nhap-don" element={<ProtectedRoute><NhapDonMoi /></ProtectedRoute>} />
          <Route path="/quan-ly-cskh" element={<ProtectedRoute><QuanLyCSKH /></ProtectedRoute>} />
          <Route path="/don-chia-cskh" element={<ProtectedRoute><DonChiaCSKH /></ProtectedRoute>} />
          <Route path="/xem-bao-cao-mkt" element={<ProtectedRoute><XemBaoCaoMKT /></ProtectedRoute>} />
          <Route path="/ffm" element={<ProtectedRoute><FFM /></ProtectedRoute>} />
          <Route path="/lenh-san-xuat" element={<ProtectedRoute><LenHSanXuat /></ProtectedRoute>} />
          <Route path="/lich-su-thay-doi" element={<ProtectedRoute><ChangeLogViewer /></ProtectedRoute>} />
          <Route path="/admin-tools" element={<ProtectedRoute><AdminTools /></ProtectedRoute>} />
        </Routes>

        {/* Toast notifications */}
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="light"
        />
      </div>
    </Router>
  );
}

export default App;
