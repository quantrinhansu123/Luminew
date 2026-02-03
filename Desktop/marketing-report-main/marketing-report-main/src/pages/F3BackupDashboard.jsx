import { Calendar, CheckCircle, Database, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { getBackupHistory, performDailyBackup } from '../services/f3DailyBackupService';

const F3BackupDashboard = () => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [backing, setBacking] = useState(false);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const data = await getBackupHistory(30);
            setHistory(data);
        } catch (error) {
            console.error('Error loading backup history:', error);
            toast.error('Lỗi khi tải lịch sử backup');
        } finally {
            setLoading(false);
        }
    };

    const handleManualBackup = async () => {
        try {
            setBacking(true);
            toast.info('Đang chạy backup...', { autoClose: 2000 });

            const result = await performDailyBackup('manual');

            if (result.success) {
                toast.success(`✅ ${result.message}`);
                loadHistory(); // Refresh history
            }
        } catch (error) {
            toast.error(`❌ Backup thất bại: ${error.message}`);
        } finally {
            setBacking(false);
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-blue-100">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                                <Database className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800">Backup F3 Tự Động</h1>
                                <p className="text-sm text-gray-600 mt-1">
                                    Backup chạy tự động lúc <span className="font-semibold text-blue-600">7:00</span> và{' '}
                                    <span className="font-semibold text-blue-600">12:00</span> mỗi ngày
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleManualBackup}
                            disabled={backing}
                            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
                        >
                            <RefreshCw className={`w-4 h-4 ${backing ? 'animate-spin' : ''}`} />
                            {backing ? 'Đang backup...' : 'Chạy backup ngay'}
                        </button>
                    </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-lg shadow p-4 border border-green-100">
                        <div className="flex items-center gap-3">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                            <div>
                                <p className="text-sm text-gray-600">Backup thành công</p>
                                <p className="text-2xl font-bold text-green-600">
                                    {history.filter(h => h.status === 'success').length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-4 border border-red-100">
                        <div className="flex items-center gap-3">
                            <XCircle className="w-8 h-8 text-red-500" />
                            <div>
                                <p className="text-sm text-gray-600">Backup thất bại</p>
                                <p className="text-2xl font-bold text-red-600">
                                    {history.filter(h => h.status === 'failed').length}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow p-4 border border-blue-100">
                        <div className="flex items-center gap-3">
                            <Calendar className="w-8 h-8 text-blue-500" />
                            <div>
                                <p className="text-sm text-gray-600">Tổng số ngày</p>
                                <p className="text-2xl font-bold text-blue-600">{history.length}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* History Table */}
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-white">Lịch sử Backup</h2>
                    </div>

                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="p-8 text-center text-gray-500">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                                <p>Đang tải...</p>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Chưa có lịch sử backup</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Ngày
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Tên Sheet
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Số Records
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Trạng thái
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Trigger
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                                            Thời gian
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {history.map((item) => (
                                        <tr
                                            key={item.id}
                                            className="hover:bg-blue-50 transition-colors"
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-400" />
                                                    <span className="font-medium text-gray-900">
                                                        {formatDate(item.backup_date)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-mono text-blue-600">
                                                    {item.sheet_name}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                    {item.records_count.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {item.status === 'success' ? (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                        <CheckCircle className="w-3 h-3 mr-1" />
                                                        Thành công
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                        <XCircle className="w-3 h-3 mr-1" />
                                                        Thất bại
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${item.backup_trigger === 'cron'
                                                        ? 'bg-purple-100 text-purple-800'
                                                        : 'bg-orange-100 text-orange-800'
                                                    }`}>
                                                    {item.backup_trigger === 'cron' ? '⏰ Auto' : '👤 Manual'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                {formatTime(item.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default F3BackupDashboard;
