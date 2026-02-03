import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { LiveSessionReport } from './pages/LiveSessionReport';
import { VideoParameterReport } from './pages/VideoParameterReport';
import { Personnel } from './pages/Personnel';
import { StoreManager } from './pages/StoreManager';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CPQC } from './pages/CPQC';
import { SalaryReport } from './pages/SalaryReport';
import { StoreOverviewPage } from './pages/StoreOverview';
import { LiveReportDetail } from './pages/LiveReportDetail';
import { MenuPermissions } from './pages/MenuPermissions';

const ProtectedLayout: React.FC = () => {
  const user = localStorage.getItem('currentUser');
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64">
        <Outlet />
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live-reports" element={<LiveSessionReport />} />
          <Route path="/live-report-detail" element={<LiveReportDetail />} />
          <Route path="/video-report" element={<VideoParameterReport />} />
          <Route path="/stores" element={<StoreManager />} />
          <Route path="/store-overview" element={<StoreOverviewPage />} />
          <Route path="/personnel" element={<Personnel />} />
          <Route path="/cpqc" element={<CPQC />} />
          <Route path="/menu-permissions" element={<MenuPermissions />} />
        </Route>
        <Route path="/salary-report" element={<SalaryReport />} />
      </Routes>
    </Router>
  );
};

export default App;