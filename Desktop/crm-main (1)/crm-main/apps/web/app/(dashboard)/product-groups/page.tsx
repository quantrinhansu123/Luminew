'use client';

import { useMemo, useState } from 'react';
import { ProductGroup } from '@/lib/types';
import { useProductGroups } from '@/lib/api-hooks';
import { PlusCircle, Edit, Trash2, X } from 'lucide-react';
import { ProductGroupFormModal } from '@/components/features/product-groups/ProductGroupFormModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { generateProductGroupCode } from '@/lib/codegen';

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

export default function ProductGroupsPage() {
  const { productGroups, loading, error, refetch } = useProductGroups();

  const grouped = useMemo(() => {
    const map = new Map<string, ProductGroup[]>();
    for (const row of productGroups || []) {
      const g = String(row?.name || '').trim() || '(Chưa có nhóm)';
      const list = map.get(g) || [];
      list.push(row);
      map.set(g, list);
    }
    const keys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'vi'));
    return keys.map((k) => ({
      groupName: k,
      rows: (map.get(k) || []).sort((a, b) =>
        String(a.product_name || '').localeCompare(String(b.product_name || ''), 'vi')
      ),
    }));
  }, [productGroups]);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ProductGroup | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Add Product Group
  const handleAddGroup = async (data: any) => {
    try {
      const payload = {
        ...data,
        // auto-generate code and keep it hidden from UI
        code: generateProductGroupCode(),
        is_active: true,
      };
      const { error: err } = await supabase.from('product_groups').insert([payload]);
      if (err) throw err;
      await refetch();
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  };

  // Edit Product Group
  const handleEditClick = (group: ProductGroup) => {
    setSelectedGroup(group);
    setIsEditModalOpen(true);
  };

  const handleEditGroup = async (data: any) => {
    if (!selectedGroup) return false;

    try {
      // Never allow editing code from UI (auto-generated & hidden)
      const { code: _code, ...payload } = data || {};
      const { error: err } = await supabase
        .from('product_groups')
        .update(payload)
        .eq('id', selectedGroup.id);
      if (err) throw err;
      await refetch();
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  };

  // Delete Product Group
  const handleDeleteGroup = (groupId: number, groupName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa nhóm sản phẩm',
      message: `Bạn có chắc muốn xóa nhóm "${groupName}"? Nhóm sẽ bị vô hiệu hóa.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const { error: err } = await supabase
            .from('product_groups')
            .update({ is_active: false })
            .eq('id', groupId);
          if (err) throw err;
          await refetch();
          toast.success('Đã xóa nhóm sản phẩm thành công!');
        } catch (err: any) {
          toast.error(`Lỗi: ${err.message}`);
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
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Quản lý Nhóm Sản phẩm</h1>
          <p className="text-slate-500 text-sm">Quản lý các nhóm sản phẩm và phân công chuyên môn cho nhân viên sale</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-blue-600 shadow-md hover:shadow-lg transition-all font-medium"
        >
          <PlusCircle size={20} />
          Thêm sản phẩm
        </button>
      </div>

      {/* Product Groups Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">ID</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Sản phẩm</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Giá định lượng</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Mô tả</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Trạng thái</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Hành động</th>
            </tr>
          </thead>
          {grouped.map((g) => (
            <tbody key={g.groupName} className="divide-y divide-slate-100">
              <tr className="bg-slate-50/70">
                <td className="px-6 py-2 text-xs font-bold text-slate-700 uppercase tracking-wide" colSpan={6}>
                  {g.groupName} <span className="text-slate-400 font-semibold">({g.rows.length})</span>
                </td>
              </tr>
              {g.rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-700 font-medium">#{row.id}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">{row.product_name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-right font-semibold text-slate-900">
                    {formatVND(Number(row.unit_price || 0))}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                    {row.description || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        row.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {row.is_active ? 'Hoạt động' : 'Ngừng'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEditClick(row)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                        title="Chỉnh sửa"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(row.id, row.name)}
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
          ))}
        </table>

        {productGroups.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            Chưa có dữ liệu. Nhấn "Thêm sản phẩm" để bắt đầu.
          </div>
        )}
      </div>

      {/* Add/Edit Product Group Modal */}
      <ProductGroupFormModal
        mode={isEditModalOpen ? 'edit' : 'add'}
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedGroup(null);
        }}
        onSubmit={isEditModalOpen ? handleEditGroup : handleAddGroup}
        defaultValues={isEditModalOpen ? selectedGroup : undefined}
        productGroups={productGroups}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
}
