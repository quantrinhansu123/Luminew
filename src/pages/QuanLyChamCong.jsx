import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabase/config';
import { toast } from 'react-toastify';
import { Calendar, Search, Download, Settings, Clock, CheckCircle, AlertTriangle, Users, ChevronDown, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Header from '../components/Header';

// Helper: parse "HH:MM:SS" string into a Date object for comparison
function parseTime(timeStr, baseDate = new Date()) {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const d = new Date(baseDate);
  d.setHours(hours, minutes, seconds || 0, 0);
  return d;
}

// Helper: format YYYY-MM-DD
function getTodayStr() {
  const d = new Date();
  d.setHours(d.getHours() + 7);
  return d.toISOString().split("T")[0];
}

export default function QuanLyChamCong() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Users (email -> name map for displaying employee names)
  const [usersMap, setUsersMap] = useState({}); // { email: name }

  // Settings
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [startTime, setStartTime] = useState("08:30:00");
  const [endTime, setEndTime] = useState("17:30:00");

  // Filters
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(getTodayStr());
  const [nameSearch, setNameSearch] = useState("");
  const [selectedEmails, setSelectedEmails] = useState([]); // employee emails picked in dropdown
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false);
  const [employeeDropdownSearch, setEmployeeDropdownSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    fetchSettings();
    fetchUsers();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [startDate, endDate]);

  // Close employee dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('email, name')
        .order('name', { ascending: true });
      if (error) throw error;
      const map = {};
      (data || []).forEach((u) => {
        if (u.email) map[u.email.toLowerCase()] = u.name || u.email;
      });
      setUsersMap(map);
    } catch (err) {
      console.warn('Không thể tải danh sách nhân sự:', err.message);
    }
  };

  // Helper: resolve display name from email
  const getEmployeeName = (email) => {
    if (!email) return '';
    return usersMap[email.toLowerCase()] || email;
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('*')
        .eq('id', 1)
        .single();
        
      if (data) {
        setStartTime(data.start_time);
        setEndTime(data.end_time);
      } else if (error && error.code !== 'PGRST116') { // Ignore not found
        console.warn("Lỗi tải cài đặt:", error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    try {
      const { error } = await supabase
        .from('attendance_settings')
        .upsert({ id: 1, start_time: startTime, end_time: endTime });

      if (error) throw error;
      toast.success("Đã lưu cài đặt giờ làm việc");
      fetchLogs(); // Re-fetch to recalculate status
    } catch (err) {
      console.error(err);
      toast.error("Không thể lưu cài đặt. Hãy chắc chắn bạn đã tạo bảng attendance_settings.");
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('attendance_logs')
        .select('*')
        .order('check_in_time', { ascending: false });

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query = query.gte('check_in_time', start.toISOString());
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte('check_in_time', end.toISOString());
      }

      const { data, error } = await query;
      if (error) {
        if (error.message.includes('relation "attendance_logs" does not exist')) {
          toast.warning("Bạn chưa tạo bảng attendance_logs trên Supabase.");
        } else {
          throw error;
        }
      } else {
        setLogs(data || []);
      }
    } catch (err) {
      console.error(err);
      toast.error(`Lỗi tải dữ liệu: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Unique employees present in the current logs (for the dropdown options)
  const employeesInLogs = useMemo(() => {
    const seen = new Map(); // email -> name
    logs.forEach((log) => {
      const email = (log.user_email || '').toLowerCase();
      if (!email) return;
      if (!seen.has(email)) seen.set(email, getEmployeeName(log.user_email));
    });
    return Array.from(seen.entries())
      .map(([email, name]) => ({ email, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [logs, usersMap]);

  // Options to render inside the dropdown (filtered by dropdown search text)
  const dropdownEmployees = useMemo(() => {
    const q = employeeDropdownSearch.trim().toLowerCase();
    if (!q) return employeesInLogs;
    return employeesInLogs.filter(
      (e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
    );
  }, [employeesInLogs, employeeDropdownSearch]);

  // Filter logs locally based on name search + selected employees dropdown
  const filteredLogs = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    const selectedSet = new Set(selectedEmails.map((e) => e.toLowerCase()));
    return logs.filter((log) => {
      const email = (log.user_email || '').toLowerCase();
      if (selectedSet.size > 0 && !selectedSet.has(email)) return false;
      if (q) {
        const name = getEmployeeName(log.user_email).toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [logs, nameSearch, selectedEmails, usersMap]);

  const toggleEmployeeSelection = (email) => {
    setSelectedEmails((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]
    );
  };

  const selectAllEmployees = () => {
    setSelectedEmails(dropdownEmployees.map((e) => e.email));
  };

  const clearSelectedEmployees = () => {
    setSelectedEmails([]);
  };

  const analyzeStatus = (log) => {
    if (!log.check_in_time) return null;
    
    const checkInDate = new Date(log.check_in_time);
    const expectedStart = parseTime(startTime, checkInDate);
    const isLate = checkInDate > expectedStart;
    
    let isEarlyLeave = false;
    if (log.check_out_time) {
      const checkOutDate = new Date(log.check_out_time);
      const expectedEnd = parseTime(endTime, checkOutDate);
      isEarlyLeave = checkOutDate < expectedEnd;
    }

    const tags = [];
    if (isLate) tags.push({ label: 'Đi muộn', color: 'bg-red-100 text-red-700 border-red-200' });
    if (log.check_out_time && isEarlyLeave) tags.push({ label: 'Về sớm', color: 'bg-orange-100 text-orange-700 border-orange-200' });
    if (!isLate && (!log.check_out_time || !isEarlyLeave)) {
      if (log.check_out_time) {
         tags.push({ label: 'Đúng giờ', color: 'bg-green-100 text-green-700 border-green-200' });
      } else {
         tags.push({ label: 'Đang làm việc', color: 'bg-blue-100 text-blue-700 border-blue-200' });
      }
    }
    
    if (!log.check_out_time) {
       tags.push({ label: 'Chưa Check-out', color: 'bg-gray-100 text-gray-700 border-gray-200' });
    }

    return tags;
  };

  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      toast.info("Không có dữ liệu để xuất");
      return;
    }

    const exportData = filteredLogs.map((log, index) => {
      const tags = analyzeStatus(log).map(t => t.label).join(", ");
      return {
        "STT": index + 1,
        "Tên Nhân Viên": getEmployeeName(log.user_email),
        "Email Nhân Viên": log.user_email,
        "Ngày": new Date(log.check_in_time).toLocaleDateString("vi-VN"),
        "Giờ Check-in": new Date(log.check_in_time).toLocaleTimeString("vi-VN"),
        "Giờ Check-out": log.check_out_time ? new Date(log.check_out_time).toLocaleTimeString("vi-VN") : "",
        "Trạng Thái": tags,
        "Link Ảnh Check-in": log.check_in_photo || "",
        "Link Ảnh Check-out": log.check_out_photo || ""
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Auto-size columns slightly
    const colWidths = [
      { wch: 5 },  // STT
      { wch: 25 }, // Tên
      { wch: 28 }, // Email
      { wch: 15 }, // Date
      { wch: 15 }, // Checkin
      { wch: 15 }, // Checkout
      { wch: 25 }, // Status
      { wch: 40 }, // Link IN
      { wch: 40 }  // Link OUT
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "LichSuChamCong");
    
    const fileName = `Bao_Cao_Cham_Cong_${startDate}_den_${endDate}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-green-600" />
              Quản lý Chấm công
            </h1>
            <p className="text-gray-500 text-sm mt-1">Theo dõi, đánh giá và xuất báo cáo điểm danh</p>
          </div>
          
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition shadow"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>

        {/* Top Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Settings Panel */}
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 uppercase flex items-center gap-2 mb-4">
              <Settings className="w-4 h-4 text-gray-500" />
              Cấu hình giờ làm việc
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Giờ bắt đầu</label>
                <input 
                  type="time" 
                  step="1"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Giờ kết thúc</label>
                <input 
                  type="time" 
                  step="1"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
            </div>
            <button 
              onClick={saveSettings}
              disabled={settingsLoading}
              className="mt-4 w-full bg-gray-800 text-white py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition disabled:opacity-50"
            >
              {settingsLoading ? "Đang lưu..." : "Lưu cấu hình"}
            </button>
          </div>

          {/* Filters Panel */}
          <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 uppercase flex items-center gap-2 mb-4">
              <Search className="w-4 h-4 text-gray-500" />
              Bộ lọc dữ liệu
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Từ ngày</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-sm"
                  />
                  <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Đến ngày</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-sm"
                  />
                  <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 font-medium mb-1">Tìm theo tên</label>
                <input
                  type="text"
                  placeholder="Nhập tên nhân viên..."
                  value={nameSearch}
                  onChange={(e) => setNameSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
              </div>
              <div ref={dropdownRef} className="relative">
                <label className="block text-xs text-gray-500 font-medium mb-1">
                  Chọn nhân viên
                  {selectedEmails.length > 0 && (
                    <span className="ml-1 text-green-600 font-semibold">({selectedEmails.length})</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() => setEmployeeDropdownOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 border border-gray-300 rounded px-3 py-2 text-sm bg-white hover:bg-gray-50 focus:ring-2 focus:ring-green-500 outline-none"
                >
                  <span className="truncate text-gray-700">
                    {selectedEmails.length === 0
                      ? 'Tất cả nhân viên'
                      : selectedEmails.length === 1
                        ? getEmployeeName(selectedEmails[0])
                        : `Đã chọn ${selectedEmails.length} nhân viên`}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {selectedEmails.length > 0 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearSelectedEmployees(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); clearSelectedEmployees(); } }}
                        className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
                        title="Bỏ chọn tất cả"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${employeeDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {employeeDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        autoFocus
                        value={employeeDropdownSearch}
                        onChange={(e) => setEmployeeDropdownSearch(e.target.value)}
                        placeholder="Tìm trong danh sách..."
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 text-xs">
                      <button
                        type="button"
                        onClick={selectAllEmployees}
                        className="text-green-600 hover:text-green-700 font-medium"
                      >
                        Chọn tất cả ({dropdownEmployees.length})
                      </button>
                      <button
                        type="button"
                        onClick={clearSelectedEmployees}
                        className="text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {dropdownEmployees.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-gray-400">
                          Không có nhân viên phù hợp
                        </div>
                      ) : (
                        dropdownEmployees.map((emp) => {
                          const checked = selectedEmails.includes(emp.email);
                          return (
                            <label
                              key={emp.email}
                              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${checked ? 'bg-green-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleEmployeeSelection(emp.email)}
                                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-gray-800 truncate">{emp.name}</div>
                                <div className="text-xs text-gray-400 truncate">{emp.email}</div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Nhân viên</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Check-in</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Check-out</th>
                  <th className="px-6 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider text-xs">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      <div className="flex justify-center mb-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                      </div>
                      Đang tải dữ liệu...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      Không tìm thấy dữ liệu chấm công phù hợp.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const statusTags = analyzeStatus(log);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{getEmployeeName(log.user_email)}</div>
                          <div className="text-gray-500 text-xs mt-0.5">{log.user_email}</div>
                          <div className="text-gray-400 text-xs">{new Date(log.check_in_time).toLocaleDateString("vi-VN")}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            {log.check_in_photo && (
                              <a href={log.check_in_photo} target="_blank" rel="noreferrer" title="Click để xem ảnh lớn">
                                <img src={log.check_in_photo} alt="in" className="w-10 h-10 rounded object-cover border border-gray-200 shadow-sm hover:opacity-80 transition" />
                              </a>
                            )}
                            <span className="font-medium">{new Date(log.check_in_time).toLocaleTimeString("vi-VN")}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {log.check_out_time ? (
                            <div className="flex items-center gap-3">
                              {log.check_out_photo && (
                                <a href={log.check_out_photo} target="_blank" rel="noreferrer" title="Click để xem ảnh lớn">
                                  <img src={log.check_out_photo} alt="out" className="w-10 h-10 rounded object-cover border border-gray-200 shadow-sm hover:opacity-80 transition" />
                                </a>
                              )}
                              <span className="font-medium">{new Date(log.check_out_time).toLocaleTimeString("vi-VN")}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">--:--:--</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {statusTags.map((tag, i) => (
                              <span key={i} className={`px-2 py-1 rounded text-xs font-semibold border ${tag.color}`}>
                                {tag.label}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
