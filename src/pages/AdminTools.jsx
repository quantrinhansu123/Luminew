import { Activity, AlertTriangle, CheckCircle, Clock, Database, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { performEndOfShiftSnapshot } from '../services/snapshotService';
import { supabase } from '../supabase/config';

const AdminTools = () => {
    const [loading, setLoading] = useState(false);
    const [checkLoading, setCheckLoading] = useState(false);
    const [dbStatus, setDbStatus] = useState(null);
    const [lastSnapshot, setLastSnapshot] = useState(null);
    const userEmail = localStorage.getItem('userEmail') || 'unknown';

    const handleSnapshot = async () => {
        if (!window.confirm('Bạn có chắc chắn muốn chốt ca? \nViệc này sẽ cập nhật dữ liệu báo cáo từ dữ liệu hiện tại.')) {
            return;
        }

        setLoading(true);
        try {
            await performEndOfShiftSnapshot(userEmail);
            toast.success('Đã chốt ca thành công! Dữ liệu báo cáo đã được cập nhật.');
            setLastSnapshot(new Date());
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi chốt ca: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const checkSystem = async () => {
        setCheckLoading(true);
        setDbStatus(null);
        try {
            // Check 1: Connection & Table Existence
            const tables = ['change_logs', 'detail_reports_view_copy', 'f3_data_snapshot'];
            const results = {};

            for (const table of tables) {
                const { error, count } = await supabase
                    .from(table)
                    .select('*', { count: 'exact', head: true });

                if (error) {
                    results[table] = { status: 'ERROR', message: error.message, code: error.code };
                } else {
                    results[table] = { status: 'OK', count: count };
                }
            }

            setDbStatus(results);
            toast.success("Đã hoàn tất kiểm tra hệ thống");
        } catch (err) {
            console.error(err);
            toast.error("Lỗi khi kiểm tra: " + err.message);
        } finally {
            setCheckLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Công cụ quản trị & Cấu hình</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Snapshot Card */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                            <Save size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Chốt Ca & Đồng bộ Báo cáo</h2>
                            <p className="text-sm text-gray-500">Cập nhật dữ liệu từ bảng thao tác sang bảng báo cáo</p>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                        <div className="flex gap-2 text-amber-800">
                            <AlertTriangle size={20} />
                            <span className="text-sm font-medium">Lưu ý quan trọng</span>
                        </div>
                        <ul className="list-disc list-inside mt-2 text-sm text-amber-700 space-y-1">
                            <li>Hành động này sẽ sao chép toàn bộ dữ liệu hiện tại sang bảng báo cáo.</li>
                            <li>Dữ liệu báo cáo cũ sẽ bị ghi đè.</li>
                            <li>Nên thực hiện vào cuối mỗi ca làm việc.</li>
                        </ul>
                    </div>

                    <button
                        onClick={handleSnapshot}
                        disabled={loading}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all
                            ${loading
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                            }`}
                    >
                        {loading ? (
                            <>
                                <span className="animate-spin text-xl">⟳</span>
                                <span>Đang xử lý...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle size={20} />
                                <span>Thực hiện Chốt Ca Ngay</span>
                            </>
                        )}
                    </button>

                    {lastSnapshot && (
                        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-green-600">
                            <Clock size={16} />
                            <span>Đã chốt lần cuối lúc: {lastSnapshot.toLocaleTimeString()}</span>
                        </div>
                    )}
                </div>

                {/* System Health Check */}
                <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
                            <Activity size={24} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Kiểm tra Hệ thống</h2>
                            <p className="text-sm text-gray-500">Kiểm tra kết nối Database & Bảng</p>
                        </div>
                    </div>

                    <div className="mb-6">
                        <p className="text-sm text-gray-600 mb-2">Sử dụng công cụ này để kiểm tra xem các bảng dữ liệu đã được khởi tạo đúng trên Supabase chưa.</p>
                    </div>

                    <button
                        onClick={checkSystem}
                        disabled={checkLoading}
                        className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all mb-4
                            ${checkLoading
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200'
                            }`}
                    >
                        {checkLoading ? (
                            <>
                                <span className="animate-spin text-xl">⟳</span>
                                <span>Đang kiểm tra...</span>
                            </>
                        ) : (
                            <>
                                <Database size={20} />
                                <span>Kiểm tra Kết nối Ngay</span>
                            </>
                        )}
                    </button>

                    {dbStatus && (
                        <div className="space-y-2 border-t pt-4">
                            {Object.entries(dbStatus).map(([table, result]) => (
                                <div key={table} className="flex items-center justify-between text-sm p-2 rounded bg-gray-50">
                                    <span className="font-medium text-gray-700">{table}</span>
                                    {result.status === 'OK' ? (
                                        <span className="text-green-600 flex items-center gap-1">
                                            <CheckCircle size={14} /> OK ({result.count} rows)
                                        </span>
                                    ) : (
                                        <div className="text-right">
                                            <span className="text-red-600 font-bold block">LỖI: {result.code}</span>
                                            <span className="text-xs text-red-500">{result.message}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminTools;
