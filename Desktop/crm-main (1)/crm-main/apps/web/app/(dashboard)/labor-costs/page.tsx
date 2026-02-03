'use client';

import { useMemo, useState } from 'react';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useLaborCosts, useMaterials, useProductGroups } from '@/lib/api-hooks';
import type { LaborCost } from '@/lib/types';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { LaborCostFormModal } from '@/components/features/labor-costs/LaborCostFormModal';

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

export default function LaborCostsPage() {
  const { laborCosts, loading, error, refetch } = useLaborCosts();
  const { productGroups } = useProductGroups();
  const { materials } = useMaterials();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selected, setSelected] = useState<LaborCost | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const activeRows = useMemo(() => (laborCosts || []).filter((r) => r.is_active !== false), [laborCosts]);

  const handleAdd = async (data: any) => {
    try {
      const payload = { ...data };
      const { error: err } = await supabase.from('labor_costs').insert([payload]);
      if (err) throw err;
      await refetch();
      return true;
    } catch (e: any) {
      toast.error(`Lỗi: ${e?.message || String(e)}`);
      return false;
    }
  };

  const handleEdit = async (data: any) => {
    if (!selected) return false;
    try {
      const { error: err } = await supabase.from('labor_costs').update(data).eq('id', selected.id);
      if (err) throw err;
      await refetch();
      return true;
    } catch (e: any) {
      toast.error(`Lỗi: ${e?.message || String(e)}`);
      return false;
    }
  };

  const handleDelete = (row: LaborCost) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa giá công',
      message: `Bạn có chắc muốn vô hiệu hóa "${row.action}"?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal((p) => ({ ...p, isOpen: false }));
        try {
          const { error: err } = await supabase.from('labor_costs').update({ is_active: false }).eq('id', row.id);
          if (err) throw err;
          await refetch();
          toast.success('Đã vô hiệu hóa giá công.');
        } catch (e: any) {
          toast.error(`Lỗi: ${e?.message || String(e)}`);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="p-6 h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-slate-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Lỗi: {error}
          <div className="text-xs text-red-600 mt-2">Gợi ý: chạy `apps/web/SETUP-LABOR-COSTS.sql` trong Supabase SQL Editor.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Bảng giá công</h1>
          <p className="text-slate-500 text-sm">Quản lý chi phí theo hành động và loại vật liệu</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-blue-600 shadow-md hover:shadow-lg transition-all font-medium"
        >
          <PlusCircle size={20} />
          Thêm giá công
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Hành động</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Nhóm SP</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Loại vật liệu</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Chi phí</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Đơn vị</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Trạng thái</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeRows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm font-semibold text-slate-900">{r.action}</td>
                <td className="px-6 py-4 text-sm text-slate-700">{r.product_groups?.name || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-700">
                  {r.materials?.element_name ? `${r.materials.element_name} (${r.materials.unit || '-'})` : '-'}
                </td>
                <td className="px-6 py-4 text-sm text-right font-semibold text-slate-900">{formatVND(Number(r.unit_cost || 0))}</td>
                <td className="px-6 py-4 text-sm text-slate-700">{r.unit || '-'}</td>
                <td className="px-6 py-4">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Hoạt động</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setSelected(r);
                        setIsEditOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                      title="Chỉnh sửa"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Xóa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {activeRows.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            Chưa có giá công. Nhấn "Thêm giá công" để bắt đầu.
          </div>
        )}
      </div>

      <LaborCostFormModal
        mode={isEditOpen ? 'edit' : 'add'}
        isOpen={isAddOpen || isEditOpen}
        onClose={() => {
          setIsAddOpen(false);
          setIsEditOpen(false);
          setSelected(null);
        }}
        onSubmit={isEditOpen ? handleEdit : handleAdd}
        defaultValues={isEditOpen ? selected : undefined}
        productGroups={productGroups}
        materials={materials}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((p) => ({ ...p, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
}

