import { Calendar, Filter, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import usePermissions from "../hooks/usePermissions";
import { DB_TO_APP_MAPPING } from "../services/api";
import { supabase } from "../services/supabaseClient";

export default function SalesOrderHistoryPage() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_HISTORY' : 'SALE_HISTORY';



    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterUser, setFilterUser] = useState("");

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("sales_order_logs")
                .select("*")
                .order("changed_at", { ascending: false })
                .limit(100);

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error("Error fetching sales logs:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatValue = (val) => {
        if (val === null || val === undefined) return "—";
        if (typeof val === "boolean") return val ? "Có" : "Không";
        return String(val);
    };

    // Helper to find diff
    const getChanges = (oldData, newData) => {
        const changes = [];
        if (!oldData || !newData) return changes;

        Object.keys(newData).forEach(key => {
            // Skip metadata columns
            if (['updated_at', 'last_modified_by', 'created_at'].includes(key)) return;

            const oldVal = oldData[key];
            const newVal = newData[key];

            // Simple equality check
            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                const label = DB_TO_APP_MAPPING[key] || key;
                changes.push({
                    key,
                    label,
                    old: oldVal,
                    new: newVal
                });
            }
        });
        return changes;
    };

    const filteredLogs = logs.filter(log => {
        const searchMatch = !searchTerm || (log.order_code && log.order_code.toLowerCase().includes(searchTerm.toLowerCase()));
        const userMatch = !filterUser || (log.changed_by && log.changed_by.toLowerCase().includes(filterUser.toLowerCase()));
        return searchMatch && userMatch;
    });

    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">

                            <h1 className="text-xl font-bold text-gray-900">Lịch sử thay đổi Sale Order</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Filters */}
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm theo Mã đơn hàng..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative min-w-[200px]">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Lọc theo người sửa..."
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                            value={filterUser}
                            onChange={e => setFilterUser(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchLogs} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                        Làm mới
                    </button>
                </div>

                {/* Timeline Logs */}
                <div className="space-y-6">
                    {loading ? (
                        <div className="text-center py-12 text-gray-500">Đang tải dữ liệu...</div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
                            Chưa có lịch sử thay đổi nào phù hợp.
                        </div>
                    ) : (
                        filteredLogs.map(log => {
                            const changes = getChanges(log.old_data, log.new_data);
                            if (changes.length === 0) return null;

                            return (
                                <div key={log.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                                {log.changed_by ? log.changed_by.charAt(0).toUpperCase() : '?'}
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900">
                                                    {log.changed_by || 'Unknown User'}
                                                </div>
                                                <div className="text-sm text-gray-500 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(log.changed_at).toLocaleString('vi-VN')}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-gray-900">
                                                Mã đơn: <span className="text-blue-600">{log.order_code}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-6 py-4">
                                        <div className="space-y-4">
                                            {changes.map((change, idx) => (
                                                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                                                    <span className="w-1/3 font-medium text-gray-700">
                                                        {change.label}:
                                                    </span>
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <span className="bg-red-50 text-red-700 px-2 py-1 rounded line-through text-xs">
                                                            {formatValue(change.old)}
                                                        </span>
                                                        <span className="text-gray-400">→</span>
                                                        <span className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-medium">
                                                            {formatValue(change.new)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
