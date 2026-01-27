import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/config';

// Add useSnapshot parameter, default to true for safety/performance as requested
export function useReportData(userRole, userTeam, userEmail, useSnapshot = false) {
  const [masterData, setMasterData] = useState([]);
  const [firebaseReports, setFirebaseReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch master data from Supabase
  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        setLoading(true);

        // Determine table name: detail_reports (Live) or detail_reports_view_copy (Snapshot)
        const tableName = useSnapshot ? 'detail_reports_view_copy' : 'detail_reports';
        console.log(`Fetching report data from ${tableName}...`);

        // --- TESTING MODE CHECK ---
        try {
          const settings = localStorage.getItem('system_settings');
          if (settings) {
            const parsed = JSON.parse(settings);
            if (parsed.dataSource === 'test') {
              console.log("🔶 [TEST MODE] Loading Mock Data for KPI Reports");
              const mockMasterData = [
                {
                  id: "TEST-KPI-01",
                  name: "Nhân viên Test 1",
                  email: "test.nv1@gmail.com",
                  date: new Date().toISOString(),
                  shift: "Hết ca",
                  product: "Sản phẩm A",
                  market: "Hà Nội",
                  team: "Team Test",
                  cpqc: 500000,
                  mess_cmt: 20,
                  orders: 5,
                  revenue: 2000000,
                  soDonHuy: 1,
                  dsSauHoanHuy: 1500000,
                  dsSauShip: 1400000,
                  dsThanhCong: 1400000,
                  kpiValue: 5000000,
                  soDonThucTe: 4,
                  dsChotThucTe: 1600000,
                  dsHoanHuyThucTe: 400000,
                  soDonHuyThucTe: 1,
                  dsSauHoanHuyThucTe: 1200000,
                  dsThanhCongThucTe: 1200000
                },
                {
                  id: "TEST-KPI-02",
                  name: "Nhân viên Test 2",
                  email: "test.nv2@gmail.com",
                  date: new Date().toISOString(),
                  shift: "Giữa ca",
                  product: "Sản phẩm B",
                  market: "Hồ Chí Minh",
                  team: "Team Test",
                  cpqc: 300000,
                  mess_cmt: 15,
                  orders: 3,
                  revenue: 1200000,
                  soDonHuy: 0,
                  dsSauHoanHuy: 1200000,
                  dsSauShip: 1100000,
                  dsThanhCong: 1100000,
                  kpiValue: 5000000,
                  soDonThucTe: 3,
                  dsChotThucTe: 1200000,
                  dsHoanHuyThucTe: 0,
                  soDonHuyThucTe: 0,
                  dsSauHoanHuyThucTe: 1200000,
                  dsThanhCongThucTe: 1200000
                }
              ];
              setMasterData(mockMasterData); // Pre-processed mock format
              setLoading(false);
              return; // EXIT EARLY
            }
          }
        } catch (e) {
          console.warn("Error checking test mode:", e);
        }
        // --------------------------

        // Query from table
        const { data, error: fetchError } = await supabase
          .from(tableName)
          .select('*')
          .not('Tên', 'is', null)
          .neq('Tên', '');

        if (fetchError) throw fetchError;

        if (data) {
          // Process data from Supabase (matching the structure from API)
          const processedData = data
            .map((r) => {
              const dsChot = Number(r["Doanh số"]) || 0;
              const dsSauHoanHuy = Number(r["DS sau hoàn hủy"]) || 0;

              return {
                id: r["id"] || r["id_NS"] || "",
                name: (r["Tên"] || "N/A").trim(),
                email: (r["Email"] || "").trim(),
                date: new Date(r["Ngày"]),
                shift: (r["ca"] || "N/A").trim(),
                product: (r["Sản_phẩm"] || "N/A").trim(),
                market: (r["Thị_trường"] || "N/A").trim(),
                team: (r["Team"] || "Khác").trim(),
                cpqc: Number(r["CPQC"]) || 0,
                mess_cmt: Number(r["Số_Mess_Cmt"]) || 0,
                orders: Number(r["Số đơn"]) || 0,
                revenue: dsChot,
                // Dữ liệu bổ sung
                soDonHuy: Number(r["Số đơn hoàn hủy"]) || 0,
                doanhSoHuy: dsChot - dsSauHoanHuy,
                dsSauHoanHuy: dsSauHoanHuy,
                dsSauShip: Number(r["Doanh số sau ship"]) || 0,
                dsThanhCong: Number(r["Doanh số TC"]) || 0,
                kpiValue: Number(r["KPIs"]) || 0,
                // Dữ liệu thực tế
                soDonThucTe: Number(r["Số đơn thực tế"]) || 0,
                dsChotThucTe: Number(r["Doanh thu chốt thực tế"]) || 0,
                dsHoanHuyThucTe: Number(r["Doanh số hoàn hủy thực tế"]) || 0,
                soDonHuyThucTe: Number(r["Số đơn hoàn hủy thực tế"]) || 0,
                dsSauHoanHuyThucTe: Number(r["Doanh số sau hoàn hủy thực tế"]) || 0,
                dsThanhCongThucTe: Number(r["Doanh số đi thực tế"]) || 0,
              };
            });

          setMasterData(processedData);
        } else {
          setMasterData([]);
        }
      } catch (err) {
        console.error('Error fetching master data from Supabase:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMasterData();
  }, [useSnapshot]);

  // Fetch Supabase reports
  useEffect(() => {
    const fetchSupabaseReports = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;

        if (data) {
          const reportsArray = data.map((row) => ({
            id: row.id,
            ...row,
            date: new Date(row.date || row.created_at),
            timestamp: row.timestamp || row.created_at,
          }));

          setFirebaseReports(reportsArray);
        } else {
          setFirebaseReports([]);
        }
      } catch (err) {
        console.error('Error fetching Supabase reports:', err);
      }
    };

    fetchSupabaseReports();
  }, []);

  // Apply access control filtering
  const filteredMasterData = useMemo(() => {
    let filtered = [...masterData];

    if (userRole === 'admin') {
      // Admin sees all
      return filtered;
    } else if (userRole === 'leader' && userTeam) {
      // Leader sees team data
      return filtered.filter(r => r.team === userTeam);
    } else if (userEmail) {
      // User sees only their own data
      return filtered.filter(r => r.email === userEmail);
    }

    return filtered;
  }, [masterData, userRole, userTeam, userEmail]);

  const filteredFirebaseReports = useMemo(() => {
    let filtered = [...firebaseReports];

    if (userRole === 'admin') {
      return filtered;
    } else if (userRole === 'leader' && userTeam) {
      return filtered.filter(r => r.team === userTeam);
    } else if (userEmail) {
      return filtered.filter(r => r.email === userEmail);
    }

    return filtered;
  }, [firebaseReports, userRole, userTeam, userEmail]);

  return {
    masterData: filteredMasterData,
    firebaseReports: filteredFirebaseReports,
    loading,
    error
  };
}
