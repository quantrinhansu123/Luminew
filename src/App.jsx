import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import AdminTools from './pages/AdminTools';
import BaoCaoChiTiet from './pages/BaoCaoChiTiet';
import BaoCaoHieuSuatKPI from './pages/BaoCaoHieuSuatKPI';
import BaoCaoMarketing from './pages/BaoCaoMarketing';
import BaoCaoSale from './pages/BaoCaoSale';
import NhanSuSaleLumiMoiView from './pages/NhanSuSaleLumiMoiView';
import BaoCaoVanDon from './pages/BaoCaoVanDon';
import BaoCaoVanHanhHtml from './pages/BaoCaoVanHanhHtml';
import ChangeLogViewer from './pages/ChangeLogViewer';
import CskhCrmHistoryPage from './pages/CskhCrmHistoryPage';
import DanhSachBaoCaoTayCSKH from './pages/DanhSachBaoCaoTayCSKH';
import NhapBaoCaoCSKH from './pages/NhapBaoCaoCSKH';
import SalesOrderHistoryPage from './pages/SalesOrderHistoryPage';
// ... (existing imports)


import BaoCaoChiTietRnD from './pages/BaoCaoChiTietRnD';
import BaoCaoRnD from './pages/BaoCaoRnD';
import DanhSachBaoCaoTay from './pages/DanhSachBaoCaoTay';
import DanhSachBaoCaoTayMKT from './pages/DanhSachBaoCaoTayMKT';
import DanhSachBaoCaoTayRnD from './pages/DanhSachBaoCaoTayRnD';
import DanhSachDon from './pages/DanhSachDon';
import DanhSachPage from './pages/DanhSachPage';
import DanhSachPageRnD from './pages/DanhSachPageRnD';
import DonChiaCSKH from './pages/DonChiaCSKH';
import ExternalView from './pages/ExternalView';
import F3Report from './pages/F3Report';
import FFM from './pages/FFM';
import DienBill from './pages/DienBill';
import DoiSoatBillCuoc from './pages/DoiSoatBillCuoc';
import QuanLyTyGia from './pages/QuanLyTyGia';
import FinanceDashboard from './pages/FinanceDashboard';
import HieuQuaMarketing from './pages/HieuQuaMarketing';
import Home from './pages/Home';
import HRDashboard from './pages/HRDashboard';
import KPIReport from './pages/KPIReport';
import LenHSanXuat from './pages/LenHSanXuat';
import Login from './pages/Login';
import NewsDetail from './pages/NewsDetail';
import NhanSu from './pages/NhanSu';
import NhapBaoCaoSale from './pages/NhapBaoCaoSale';
import NhapDonMoi from './pages/NhapDonMoi';
import Profile from './pages/Profile';
import QuanLyCSKH from './pages/QuanLyCSKH';
import ReportDashboard from './pages/ReportDashboard';
import BangDoiSoatDayFFM from './pages/BangDoiSoatDayFFM';
import VanDon from './pages/VanDon';
import DanhSachVanDon from './pages/DanhSachVanDon';
import DanhSachBaoCaoVanDon from './pages/DanhSachBaoCaoVanDon';
import DashboardQuanTri from './pages/DashboardQuanTri';
import XemBaoCaoMKTLegacy from './pages/XemBaoCaoMKTLegacy';
import XemBaoCaoRnD from './pages/XemBaoCaoRnD';
import TestMKT from './pages/TestMKT.jsx';
import TestBaoCaoOrders from './pages/TestBaoCaoOrders.jsx';

/* Header component extracted to `src/components/Header.jsx` */

import ErrorBoundary from './components/ErrorBoundary';

/** File HTML cũ `baocaokpiCEO.html` không còn — chuyển sang trang KPI React, giữ query. */
function BaocaokpiCEORedirect() {
  const { search } = useLocation();
  return <Navigate to={`/bao-cao-hieu-suat-kpi${search}`} replace />;
}

/** Không render Header (dùng trong iframe tab Vận đơn Sale). */
function AppShell() {
  const location = useLocation();
  const hideHeader = location.pathname.startsWith('/embed/');

  return (
    <>
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50">
        <ErrorBoundary>
          {!hideHeader && <Header />}

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
            <Route path="/sale-nhap-bao-cao" element={<ProtectedRoute><NhapBaoCaoSale /></ProtectedRoute>} />
            <Route
              path="/xem-bao-cao-sale"
              element={
                <ProtectedRoute>
                  <NhanSuSaleLumiMoiView teamKeyword="sale" showPersonnelNameFilter />
                </ProtectedRoute>
              }
            />
            <Route path="/xem-bao-cao-Sale" element={<Navigate to="/xem-bao-cao-sale" replace />} />
            <Route path="/danh-sach-bao-cao-tay" element={<ProtectedRoute><DanhSachBaoCaoTay /></ProtectedRoute>} />
            <Route path="/bao-cao-f3" element={<ProtectedRoute><F3Report /></ProtectedRoute>} />
            <Route path="/bao-cao-hieu-suat-kpi" element={<ProtectedRoute><BaoCaoHieuSuatKPI /></ProtectedRoute>} />
            <Route path="/embed/bao-cao-hieu-suat-kpi" element={<ProtectedRoute><BaoCaoHieuSuatKPI /></ProtectedRoute>} />
            <Route path="/nhan-su" element={<ProtectedRoute><NhanSu /></ProtectedRoute>} />
            <Route path="/hr-dashboard" element={<ProtectedRoute><HRDashboard /></ProtectedRoute>} />
            <Route path="/finance-dashboard" element={<ProtectedRoute><FinanceDashboard /></ProtectedRoute>} />

            <Route path="/ho-so" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/van-don" element={<ProtectedRoute><VanDon /></ProtectedRoute>} />
            <Route path="/van-don-hcm" element={<ProtectedRoute><VanDon dataSource="hcm" /></ProtectedRoute>} />
            <Route path="/bang-doi-soat-day-ffm" element={<ProtectedRoute><BangDoiSoatDayFFM /></ProtectedRoute>} />
            <Route path="/bao-cao-van-don" element={<ProtectedRoute><BaoCaoVanDon /></ProtectedRoute>} />
            <Route path="/bao-cao-van-hanh" element={<ProtectedRoute><BaoCaoVanHanhHtml /></ProtectedRoute>} />
            <Route path="/embed/bao-cao-van-don" element={<ProtectedRoute><BaoCaoVanDon /></ProtectedRoute>} />
            <Route path="/dashboard-quan-tri" element={<ProtectedRoute><DashboardQuanTri /></ProtectedRoute>} />
            <Route path="/danh-sach-van-don" element={<ProtectedRoute><DanhSachVanDon /></ProtectedRoute>} />
            <Route path="/danh-sach-bao-cao-van-don" element={<ProtectedRoute><DanhSachBaoCaoVanDon /></ProtectedRoute>} />
            <Route path="/danh-sach-don" element={<ProtectedRoute><DanhSachDon /></ProtectedRoute>} />
            <Route path="/danh-sach-don-hcm" element={<ProtectedRoute><DanhSachDon dataSource="hcm" /></ProtectedRoute>} />
            <Route path="/danh-sach-page" element={<ProtectedRoute><DanhSachPage /></ProtectedRoute>} />
            <Route path="/nhap-don" element={<ProtectedRoute><NhapDonMoi /></ProtectedRoute>} />
            <Route path="/nhap-don-moi" element={<ProtectedRoute><NhapDonMoi /></ProtectedRoute>} />
            <Route path="/chinh-sua-don" element={<ProtectedRoute><NhapDonMoi isEdit={true} /></ProtectedRoute>} />

            <Route path="/quan-ly-cskh" element={<ProtectedRoute><QuanLyCSKH /></ProtectedRoute>} />
            <Route path="/don-chia-cskh" element={<ProtectedRoute><DonChiaCSKH /></ProtectedRoute>} />
            <Route
              path="/xem-bao-cao-cskh"
              element={
                <ProtectedRoute>
                  <NhanSuSaleLumiMoiView teamExactFilter="CSKH- Lý" />
                </ProtectedRoute>
              }
            />
            <Route path="/nhap-bao-cao-cskh" element={<ProtectedRoute><NhapBaoCaoCSKH /></ProtectedRoute>} />
            <Route path="/danh-sach-bao-cao-tay-cskh" element={<ProtectedRoute><DanhSachBaoCaoTayCSKH /></ProtectedRoute>} />
            {/* MKT: /xem-bao-cao-mkt trỏ thẳng tới HTML legacy (iframe) */}
            <Route
              path="/xem-bao-cao-mkt"
              element={
                <ProtectedRoute>
                  <XemBaoCaoMKTLegacy />
                </ProtectedRoute>
              }
            />
            <Route path="/xem-bao-cao-mkt-react" element={<ProtectedRoute><XemBaoCaoMKTLegacy /></ProtectedRoute>} />
            <Route
              path="/xem-bao-cao-mkt-legacy"
              element={
                <ProtectedRoute>
                  <XemBaoCaoMKTLegacy />
                </ProtectedRoute>
              }
            />
            <Route path="/danh-sach-bao-cao-tay-mkt" element={<ProtectedRoute><DanhSachBaoCaoTayMKT /></ProtectedRoute>} />
            <Route path="/test-mkt" element={<ProtectedRoute><TestMKT /></ProtectedRoute>} />
            <Route path="/test-bao-cao-orders" element={<ProtectedRoute><TestBaoCaoOrders /></ProtectedRoute>} />
            <Route path="/ffm_MGT" element={<ProtectedRoute><FFM variant="MGT" /></ProtectedRoute>} />
            <Route path="/ffm_TT" element={<ProtectedRoute><FFM variant="TT" /></ProtectedRoute>} />
            <Route path="/ffm" element={<Navigate to="/ffm_MGT" replace />} />
            <Route path="/dien-bill" element={<ProtectedRoute><DienBill /></ProtectedRoute>} />
            <Route path="/doi-soat-bill-cuoc" element={<ProtectedRoute><DoiSoatBillCuoc /></ProtectedRoute>} />
            <Route path="/quan-ly-ty-gia" element={<ProtectedRoute><QuanLyTyGia /></ProtectedRoute>} />
            <Route path="/lenh-san-xuat" element={<ProtectedRoute><LenHSanXuat /></ProtectedRoute>} />

            {/* RD Module Routes */}
            <Route path="/bao-cao-rd" element={<ProtectedRoute><BaoCaoRnD /></ProtectedRoute>} />
            <Route path="/xem-bao-cao-rd" element={<ProtectedRoute><XemBaoCaoRnD /></ProtectedRoute>} />
            <Route path="/bao-cao-chi-tiet-rd" element={<ProtectedRoute><BaoCaoChiTietRnD /></ProtectedRoute>} />
            <Route path="/danh-sach-page-rd" element={<ProtectedRoute><DanhSachPageRnD /></ProtectedRoute>} />
            <Route path="/danh-sach-bao-cao-tay-rd" element={<ProtectedRoute><DanhSachBaoCaoTayRnD /></ProtectedRoute>} />

            {/* History Routes */}
            <Route path="/lich-su-thay-doi" element={<ProtectedRoute><ChangeLogViewer /></ProtectedRoute>} />
            <Route path="/lich-su-van-don" element={<Navigate to="/van-don" replace />} />
            <Route path="/lich-su-sale-order" element={<ProtectedRoute><SalesOrderHistoryPage /></ProtectedRoute>} />
            <Route path="/lich-su-cskh" element={<ProtectedRoute><CskhCrmHistoryPage /></ProtectedRoute>} />

            {/* Admin Tools & System */}
            <Route path="/admin-tools" element={<AdminTools />} />

            <Route path="/news/:id" element={<ProtectedRoute><NewsDetail /></ProtectedRoute>} />
            <Route path="/external-view" element={<ProtectedRoute><ExternalView /></ProtectedRoute>} />
          </Routes>
        </ErrorBoundary>

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
    </>
  );
}

function App() {
  console.log('📱 App component rendering...');
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppShell />
    </Router>
  );
}

export default App;
