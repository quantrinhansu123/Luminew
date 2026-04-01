import usePermissions from '../hooks/usePermissions';
import ReportFormCSKH from './ReportFormCSKH';

export default function NhapBaoCaoCSKH({ dataSource = 'default' }) {
    const { canView } = usePermissions();
    const isHcm = dataSource === 'hcm';
    const hasAccess = isHcm
        ? canView('CSKH_INPUT_HCM') || canView('CSKH_INPUT')
        : canView('CSKH_INPUT');
    const deniedLabel = isHcm ? 'CSKH_INPUT_HCM hoặc CSKH_INPUT' : 'CSKH_INPUT';

    if (!hasAccess) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-center p-8 bg-white rounded-lg shadow-md">
                    <h2 className="text-xl font-bold text-red-600 mb-2">Truy cập bị từ chối</h2>
                    <p className="text-gray-600">Bạn không có quyền truy cập trang này ({deniedLabel}).</p>
                </div>
            </div>
        );
    }

    return (
        <ReportFormCSKH
            reportTable={isHcm ? 'sale_report_hcm' : 'sales_reports'}
            pageTitle={isHcm ? 'Báo Cáo CSKH (HCM)' : 'Báo Cáo CSKH'}
        />
    );
}
