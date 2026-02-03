import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase/config';

// Add useSnapshot parameter, default to true for safety/performance as requested
export function useReportData(userRole, userTeam, userEmail, useSnapshot = true) {
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
