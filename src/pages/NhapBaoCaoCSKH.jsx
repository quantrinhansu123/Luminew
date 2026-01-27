import usePermissions from '../hooks/usePermissions';
import ReportFormCSKH from './ReportFormCSKH';

export default function NhapBaoCaoCSKH() {
    const { canView } = usePermissions();

    if (!canView('CSKH_INPUT')) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center p-8 bg-white rounded-lg shadow-md">
                    <h2 className="text-xl font-bold text-red-600 mb-2">Truy cập bị từ chối</h2>
                    <p className="text-gray-600">Bạn không có quyền truy cập trang này (CSKH_INPUT).</p>
                </div>
            </div>
        );
    }

    return <ReportFormCSKH />;
}
