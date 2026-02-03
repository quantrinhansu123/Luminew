import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import usePermissions from '../hooks/usePermissions';
import ReportForm from './ReportForm'; // Import the form component

export default function NhapBaoCaoSale() {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const teamFilter = searchParams.get('team'); // 'RD' or null

    // Permission Logic
    const { canView } = usePermissions();
    const permissionCode = teamFilter === 'RD' ? 'RND_INPUT' : 'SALE_INPUT';



    const [currentUserInfo, setCurrentUserInfo] = useState({ ten: '', email: '' });

    useEffect(() => {
        // Get user info from localStorage
        const ten = localStorage.getItem('username') || '';
        const email = localStorage.getItem('userEmail') || '';
        setCurrentUserInfo({ ten, email });
    }, []);


    if (!canView(permissionCode)) {
        return <div className="p-8 text-center text-red-600 font-bold">Bạn không có quyền truy cập trang này ({permissionCode}).</div>;
    }

    if (!currentUserInfo.ten || !currentUserInfo.email) {
        return (
            <div style={{ padding: '20px', textAlign: 'center' }}>
                Đang tải thông tin người dùng...
            </div>
        );
    }

    // Use the ReportForm which now writes to Supabase
    return (
        <ReportForm />
    );
}
