import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import AdminTools from './pages/AdminTools';
import BaoCaoPhanBoDonHang from './pages/BaoCaoPhanBoDonHang';
import BaoCaoChiTiet from './pages/BaoCaoChiTiet';
import BaoCaoChiTietHcm from './pages/BaoCaoChiTietHcm';
import BaoCaoHieuSuatKPI from './pages/BaoCaoHieuSuatKPI';
import BaoCaoMarketing from './pages/BaoCaoMarketing';
import BaoCaoSale from './pages/BaoCaoSale';
import NhanSuSaleLumiMoiView from './pages/NhanSuSaleLumiMoiView';
import ChamCong from './pages/ChamCong';
import QuanLyChamCong from './pages/QuanLyChamCong';
import BaoCaoVanDon from './pages/BaoCaoVanDon';
import BaoCaoVanHanhHtml from './pages/BaoCaoVanHanhHtml';
import BaoCaoVanHanhHcm from './pages/BaoCaoVanHanhHcm';
import ChangeLogViewer from './pages/ChangeLogViewer';
import CskhCrmHistoryPage from './pages/CskhCrmHistoryPage';
import DanhSachBaoCaoTayCSKH, {
  CSKH_MANUAL_REPORT_HCM_TEAMS,
  CSKH_MANUAL_REPORT_HN_TEAMS,
} from './pages/DanhSachBaoCaoTayCSKH';
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
import F3DataSheet from './pages/F3DataSheet';
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
import BangDoiSoatDayFFM, { BangDoiSoatDayFFMHcm } from './pages/BangDoiSoatDayFFM';
import VanDon from './pages/VanDon';
import DanhSachVanDon from './pages/DanhSachVanDon';
import DanhSachBaoCaoVanDon from './pages/DanhSachBaoCaoVanDon';
import DashboardQuanTri from './pages/DashboardQuanTri';
import DashboardDieuHanh from './pages/DashboardDieuHanh';
import BaoCaoCeo from './pages/BaoCaoCeo';
import XemBaoCaoMKTLegacy from './pages/XemBaoCaoMKTLegacy';
import XemBaoCaoMKTHcm from './pages/XemBaoCaoMKTHcm';
import XemBaoCaoMKTRnD from './pages/XemBaoCaoMKTRnD';
import XemBaoCaoMktHnHcm from './pages/XemBaoCaoMktHnHcm';
import XemBaoCaoRnD from './pages/XemBaoCaoRnD';
import MktKpiAlertsAdmin from './pages/MktKpiAlertsAdmin';
import TestMKT from './pages/TestMKT.jsx';
import TestBaoCaoOrders from './pages/TestBaoCaoOrders.jsx';

/* Header component extracted to `src/components/Header.jsx` */

import ErrorBoundary from './components/ErrorBoundary';

/** File HTML cũ `baocaokpiCEO.html` không còn — chuyển sang trang KPI React, giữ query. */
function BaocaokpiCEORedirect() {
  const { search } = useLocation();
  return <Navigate to={`/bao-cao-hieu-suat-kpi${search}`} replace />;
}

/** Không render Header: route `/embed/*`, hoặc toàn bộ app đang chạy trong iframe (vd. tab Dashboard quản trị). */
function AppShell() {
  const location = useLocation();
  const inIframe =
    typeof window !== 'undefined' && window.self !== window.top;
  const hideHeader = location.pathname.startsWith('/embed/') || inIframe;

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
            <Route path="/bao-cao-chi-tiet-hcm" element={<ProtectedRoute><BaoCaoChiTietHcm /></ProtectedRoute>} />
            <Route path="/bang-bao-cao" element={<ProtectedRoute><ReportDashboard /></ProtectedRoute>} />
            <Route path="/bao-cao-kpi" element={<ProtectedRoute><KPIReport /></ProtectedRoute>} />
            <Route path="/hieu-qua-mkt" element={<ProtectedRoute><HieuQuaMarketing /></ProtectedRoute>} />
            <Route path="/bao-cao-marketing" element={<ProtectedRoute><BaoCaoMarketing /></ProtectedRoute>} />
            <Route
              path="/bao-cao-marketing-hcm"
              element={
                <ProtectedRoute>
                  <BaoCaoMarketing
                    reportTableName="marketing_report_hcm"
                    ordersTableName="order_code_hcm"
                    pageTitle="Báo cáo MKT (HCM)"
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/bao-cao-mkt-ke-toan-lanh-dao" element={<Navigate to="/" replace />} />
            <Route path="/bao-cao-sale" element={<ProtectedRoute><BaoCaoSale /></ProtectedRoute>} />
            <Route path="/sale-nhap-bao-cao" element={<ProtectedRoute><NhapBaoCaoSale /></ProtectedRoute>} />
            <Route
              path="/sale-nhap-bao-cao-hcm"
              element={
                <ProtectedRoute>
                  <NhapBaoCaoSale dataSource="hcm" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/xem-bao-cao-sale"
              element={
                <ProtectedRoute>
                  <NhanSuSaleLumiMoiView
                    teamKeyword="sale"
                    showPersonnelNameFilter
                    excludeReportTeamsContainingHcm
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/xem-bao-cao-sale-hcm"
              element={
                <ProtectedRoute>
                  <NhanSuSaleLumiMoiView
                    reportTableName="sale_report_hcm"
                    hcmXemBaoCaoSaleTeamFilter
                    showPersonnelNameFilter
                    hideBoPhanFilter
                    pageAccessCodes={['SALE_VIEW_HCM']}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/xem-bao-cao-Sale" element={<Navigate to="/xem-bao-cao-sale" replace />} />
            <Route path="/danh-sach-bao-cao-tay" element={<ProtectedRoute><DanhSachBaoCaoTay /></ProtectedRoute>} />
            <Route
              path="/danh-sach-bao-cao-tay-hcm"
              element={
                <ProtectedRoute>
                  <DanhSachBaoCaoTay dataSource="hcm" />
                </ProtectedRoute>
              }
            />
            <Route path="/bao-cao-f3" element={<ProtectedRoute><F3Report /></ProtectedRoute>} />
            <Route path="/du-lieu-f3" element={<ProtectedRoute><F3DataSheet /></ProtectedRoute>} />
            <Route path="/du-lieu-f3-hcm" element={<ProtectedRoute><F3DataSheet dataSource="hcm" /></ProtectedRoute>} />
            <Route path="/bao-cao-hieu-suat-kpi" element={<ProtectedRoute><BaoCaoHieuSuatKPI /></ProtectedRoute>} />
            <Route path="/embed/bao-cao-hieu-suat-kpi" element={<ProtectedRoute><BaoCaoHieuSuatKPI /></ProtectedRoute>} />
            <Route path="/nhan-su" element={<ProtectedRoute><NhanSu /></ProtectedRoute>} />
            <Route path="/cham-cong" element={<ProtectedRoute><ChamCong /></ProtectedRoute>} />
            <Route path="/quan-ly-cham-cong" element={<ProtectedRoute><QuanLyChamCong /></ProtectedRoute>} />
            <Route path="/hr-dashboard" element={<ProtectedRoute><HRDashboard /></ProtectedRoute>} />
            <Route path="/finance-dashboard" element={<ProtectedRoute><FinanceDashboard /></ProtectedRoute>} />

            <Route path="/ho-so" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/van-don" element={<ProtectedRoute><VanDon /></ProtectedRoute>} />
            <Route path="/van-don-hcm" element={<ProtectedRoute><VanDon dataSource="hcm" /></ProtectedRoute>} />
            <Route path="/bang-doi-soat-day-ffm" element={<ProtectedRoute><BangDoiSoatDayFFM /></ProtectedRoute>} />
            <Route path="/bang-doi-soat-day-ffm-hcm" element={<ProtectedRoute><BangDoiSoatDayFFMHcm /></ProtectedRoute>} />
            <Route path="/bao-cao-van-don" element={<ProtectedRoute><BaoCaoVanDon /></ProtectedRoute>} />
            <Route path="/bao-cao-van-hanh" element={<ProtectedRoute><BaoCaoVanHanhHtml /></ProtectedRoute>} />
            <Route path="/bao-cao-van-hanh-hcm" element={<ProtectedRoute><BaoCaoVanHanhHcm /></ProtectedRoute>} />
            <Route path="/embed/bao-cao-van-don" element={<ProtectedRoute><BaoCaoVanDon /></ProtectedRoute>} />
            <Route path="/dashboard-dieu-hanh" element={<ProtectedRoute><DashboardDieuHanh /></ProtectedRoute>} />
            <Route path="/dashboard-quan-tri" element={<ProtectedRoute><DashboardQuanTri /></ProtectedRoute>} />
            <Route path="/bao-cao-ceo" element={<ProtectedRoute><BaoCaoCeo /></ProtectedRoute>} />
            <Route path="/danh-sach-van-don" element={<ProtectedRoute><DanhSachVanDon /></ProtectedRoute>} />
            <Route path="/danh-sach-van-don-hcm" element={<ProtectedRoute><DanhSachVanDon dataSource="hcm" /></ProtectedRoute>} />
            <Route path="/danh-sach-bao-cao-van-don" element={<ProtectedRoute><DanhSachBaoCaoVanDon /></ProtectedRoute>} />
            <Route path="/danh-sach-don" element={<ProtectedRoute><DanhSachDon key="danh-sach-don-default" /></ProtectedRoute>} />
            <Route path="/danh-sach-don-hcm" element={<ProtectedRoute><DanhSachDon key="danh-sach-don-hcm" dataSource="hcm" /></ProtectedRoute>} />
            <Route path="/danh-sach-page" element={<ProtectedRoute><DanhSachPage /></ProtectedRoute>} />
            <Route path="/nhap-don" element={<ProtectedRoute><NhapDonMoi /></ProtectedRoute>} />
            <Route path="/nhap-don-moi" element={<ProtectedRoute><NhapDonMoi /></ProtectedRoute>} />
            <Route path="/chinh-sua-don" element={<ProtectedRoute><NhapDonMoi isEdit={true} /></ProtectedRoute>} />

            <Route path="/quan-ly-cskh" element={<ProtectedRoute><QuanLyCSKH /></ProtectedRoute>} />
            <Route
              path="/quan-ly-cskh-hcm"
              element={
                <ProtectedRoute>
                  <QuanLyCSKH
                    ordersTableName="order_code_hcm"
                    pageTitle="QUẢN LÝ CSKH HCM"
                    pageSubtitle="Dữ liệu từ order_code_hcm"
                    accessPermissionCodes={['CSKH_LIST_HCM']}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/don-chia-cskh" element={<ProtectedRoute><DonChiaCSKH /></ProtectedRoute>} />
            <Route
              path="/don-chia-cskh-hcm"
              element={
                <ProtectedRoute>
                  <DonChiaCSKH
                    key="don-chia-cskh-hcm"
                    ordersTableName="order_code_hcm"
                    pageTitle="ĐƠN CHIA CSKH (HCM)"
                    pageSubtitle="Dữ liệu từ order_code_hcm"
                    accessPermissionCodes={['CSKH_PAID_HCM']}
                    unlimitedDataFetch
                    defaultRowsPerPage={0}
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/xem-bao-cao-cskh"
              element={
                <ProtectedRoute>
                  <NhanSuSaleLumiMoiView teamExactFilter="CSKH-HN" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/xem-bao-cao-cskh-hcm"
              element={
                <ProtectedRoute>
                  <NhanSuSaleLumiMoiView
                    teamInFilter={CSKH_MANUAL_REPORT_HCM_TEAMS}
                    pageAccessCodes={['CSKH_VIEW_HCM']}
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/nhap-bao-cao-cskh" element={<ProtectedRoute><NhapBaoCaoCSKH /></ProtectedRoute>} />
            <Route
              path="/nhap-bao-cao-cskh-hcm"
              element={
                <ProtectedRoute>
                  <NhapBaoCaoCSKH dataSource="hcm" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/danh-sach-bao-cao-tay-cskh"
              element={
                <ProtectedRoute>
                  <DanhSachBaoCaoTayCSKH salesReportTeamIn={CSKH_MANUAL_REPORT_HN_TEAMS} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/danh-sach-bao-cao-tay-cskh-hcm"
              element={
                <ProtectedRoute>
                  <DanhSachBaoCaoTayCSKH
                    salesReportTeamIn={CSKH_MANUAL_REPORT_HCM_TEAMS}
                    pageAccessCodes={['CSKH_MANUAL_HCM']}
                    pageTitleSuffix=" (HCM)"
                  />
                </ProtectedRoute>
              }
            />
            {/* MKT: /xem-bao-cao-mkt trỏ thẳng tới HTML legacy (iframe) */}
            <Route
              path="/xem-bao-cao-mkt"
              element={
                <ProtectedRoute>
                  <XemBaoCaoMKTLegacy />
                </ProtectedRoute>
              }
            />
            <Route
              path="/xem-bao-cao-mkt-hcm"
              element={
                <ProtectedRoute>
                  <XemBaoCaoMKTHcm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/xem-bao-cao-mkt-hn-hcm"
              element={
                <ProtectedRoute>
                  <XemBaoCaoMktHnHcm />
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
            <Route path="/xem-bao-cao-mkt-rd" element={<ProtectedRoute><XemBaoCaoMKTRnD /></ProtectedRoute>} />
            <Route path="/danh-sach-bao-cao-tay-mkt" element={<ProtectedRoute><DanhSachBaoCaoTayMKT /></ProtectedRoute>} />
            <Route
              path="/danh-sach-bao-cao-tay-mkt-hcm"
              element={
                <ProtectedRoute>
                  <DanhSachBaoCaoTayMKT
                    reportTableName="marketing_report_hcm"
                    pageTitleSuffix=" (HCM)"
                  />
                </ProtectedRoute>
              }
            />
            <Route path="/test-mkt" element={<ProtectedRoute><TestMKT /></ProtectedRoute>} />
            <Route path="/test-bao-cao-orders" element={<ProtectedRoute><TestBaoCaoOrders /></ProtectedRoute>} />
            <Route path="/ffm_MGT" element={<ProtectedRoute><FFM variant="MGT" /></ProtectedRoute>} />
            <Route path="/ffm_TT" element={<ProtectedRoute><FFM variant="TT" /></ProtectedRoute>} />
            <Route path="/ffm" element={<Navigate to="/ffm_MGT" replace />} />
            <Route path="/dien-bill" element={<ProtectedRoute><DienBill /></ProtectedRoute>} />
            <Route path="/doi-soat-bill-cuoc" element={<ProtectedRoute><DoiSoatBillCuoc /></ProtectedRoute>} />
            <Route path="/doi-soat-bill-cuoc-hcm" element={<ProtectedRoute><DoiSoatBillCuoc dataScope="hcm" /></ProtectedRoute>} />
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

            {/* Admin Tools & System — cần đăng nhập + quyền ADMIN_TOOLS (xem trong AdminTools.jsx) */}
            <Route path="/admin-tools" element={<ProtectedRoute><AdminTools /></ProtectedRoute>} />
            <Route path="/bao-cao-phan-bo-don-hang" element={<ProtectedRoute><BaoCaoPhanBoDonHang /></ProtectedRoute>} />
            <Route path="/admin/mkt-alerts" element={<ProtectedRoute><MktKpiAlertsAdmin /></ProtectedRoute>} />
            <Route path="/admin" element={<Navigate to="/admin-tools" replace />} />

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
        // Không bật v7_startTransition: điều hướng bọc startTransition dễ bị trì hoãn khi trang nặng
        // (vd. /bao-cao-ceo) → thanh địa chỉ đổi nhưng UI vẫn dừng ở trang cũ tới khi F5.
        v7_relativeSplatPath: true,
      }}
    >
      <AppShell />
    </Router>
  );
}

export default App;
