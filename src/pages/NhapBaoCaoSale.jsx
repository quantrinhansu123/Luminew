import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import ReportForm from './ReportForm';

function NhapBaoCaoSale({ dataSource = 'default' }) {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null
    const isHcm = dataSource === 'hcm';

    const { canView } = usePermissions();
    const permissionCode =
        teamFilter === 'RD' ? 'RND_INPUT' : isHcm ? 'SALE_INPUT_HCM' : 'SALE_INPUT';

    const [currentUserInfo, setCurrentUserInfo] = useState({ ten: '', email: '' });

    useEffect(() => {
        const ten = localStorage.getItem('username') || '';
        const email = localStorage.getItem('userEmail') || '';
        setCurrentUserInfo({ ten, email });
    }, []);

    if (!canView(permissionCode)) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                Bạn không có quyền truy cập trang này ({permissionCode}).
            </div>
        );
    }

    if (!currentUserInfo.ten || !currentUserInfo.email) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                Đang tải thông tin người dùng...
            </div>
        );
    }

    return (
        <ReportForm
            reportTable={isHcm ? 'sale_report_hcm' : 'sales_reports'}
            ordersTable={isHcm ? 'order_code_hcm' : 'orders'}
            pageTitle={isHcm ? 'Báo Cáo Sale (HCM)' : 'Báo Cáo Sale'}
        />
    );
}

export default NhapBaoCaoSale;
