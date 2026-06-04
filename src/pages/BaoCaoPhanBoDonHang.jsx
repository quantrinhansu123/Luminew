import { useNavigate } from 'react-router-dom';

import BaoCaoPhanBoDonHangReport from '../components/chiaDonVanDon/BaoCaoPhanBoDonHangReport';
import usePhanBoDonHangAccess from '../hooks/usePhanBoDonHangAccess';

/** Trang riêng: Báo cáo Phân bổ Đơn hàng (history_chia_don + chi_tiet_chia). */
export default function BaoCaoPhanBoDonHang() {
  const navigate = useNavigate();
  const { canAccess, loading, isAdminView, userBranch } = usePhanBoDonHangAccess();

  if (loading) {
    return <div className="p-8 text-center text-gray-600">Đang kiểm tra quyền truy cập…</div>;
  }

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền xem báo cáo phân bổ. Chỉ admin hoặc nhân viên U1 trong danh sách vận đơn mới được truy cập.
      </div>
    );
  }

  return (
    <BaoCaoPhanBoDonHangReport
      onClose={() => navigate('/')}
      allowedBranchKeys={isAdminView ? null : [userBranch]}
    />
  );
}
