'use client';

import React, { useState, useEffect } from 'react';
import { useSalesAllocation, useProductGroups, useSalesEmployees } from '@/lib/api-hooks';
import { SalesAllocationRule, CUSTOMER_GROUPS } from '@/lib/types';
import { Plus, X, Shuffle, Sparkles, CheckCircle, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { supabase } from '@/lib/supabase';

export default function SalesAllocationPage() {
  const { allocations, loading, addAllocation, updateAllocation, deleteAllocation, autoDistribute } = useSalesAllocation();
  const { productGroups } = useProductGroups();
  const { salesEmployees } = useSalesEmployees();
  const router = useRouter();

  const [activePopover, setActivePopover] = useState<{ id: number, type: 'product' | 'sale' | 'group' } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [distributionResult, setDistributionResult] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  //Close popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.popover-container')) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteRow = (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa dòng phân bổ',
      message: 'Bạn có chắc muốn xóa dòng phân bổ này?',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        await deleteAllocation(id);
        toast.success('Đã xóa dòng phân bổ!');
      },
    });
  };

  const handleAddRow = async () => {
    await addAllocation({
      customer_group: CUSTOMER_GROUPS[0],
      product_group_ids: [],
      assigned_sales_ids: []
    });
  };

  const updateField = async (id: number, field: keyof SalesAllocationRule, value: any) => {
    const item = allocations.find(a => a.id === id);
    if (!item) return;
    await updateAllocation(id, { ...item, [field]: value });
  };

  const addTag = async (id: number, type: 'product_group_ids' | 'assigned_sales_ids', value: number) => {
    const item = allocations.find(a => a.id === id);
    if (!item) return;

    // Check duplicate
    if (item[type].includes(value)) return;

    await updateAllocation(id, {
      ...item,
      [type]: [...item[type], value]
    });
    setActivePopover(null);
  };

  const removeTag = async (id: number, type: 'product_group_ids' | 'assigned_sales_ids', value: number) => {
    const item = allocations.find(a => a.id === id);
    if (!item) return;
    await updateAllocation(id, {
      ...item,
      [type]: item[type].filter(t => t !== value)
    });
  };

  const handleAutoDistribute = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Tự động phân bổ Sales',
      message: 'Bạn có chắc muốn tự động phân bổ Sales cho các khách hàng chưa có người phụ trách?\n\nƯu tiên 1: Phân bổ theo quy tắc nhóm sản phẩm (nếu khớp)\nƯu tiên 2: Phân bổ đều cho tất cả Sales đang hoạt động',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const result = await autoDistribute();
          setDistributionResult(result);
          if (!result || !result.assignedCount) {
            toast.info('Không có Lead nào cần phân bổ (Lead đã có Sale hoặc đã chuyển đổi).');
            return;
          }
          setShowSuccessModal(true);
        } catch (error) {
          toast.error('Lỗi khi phân bổ tự động. Vui lòng thử lại.');
        }
      },
    });
  };

  // Auto-fill sales based on specializations
  const handleAutoFillSales = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Tự động điền Sales',
      message: 'Tự động điền Sales vào các dòng phân bổ dựa trên chuyên môn sản phẩm?\n\nHệ thống sẽ tìm Sales có chuyên môn phù hợp với Nhóm SP đã chọn.',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          let updated = 0;
          for (const allocation of allocations) {
            if (allocation.product_group_ids.length === 0) continue;

            // Get all sales IDs that specialize in these product groups
            const salesIdsSet = new Set<number>();

            for (const productGroupId of allocation.product_group_ids) {
              const { data: specs, error } = await supabase
                .from('sales_product_specializations')
                .select('sales_employee_id')
                .eq('product_group_id', productGroupId);

              if (error) throw error;
              (specs || []).forEach((s: any) => salesIdsSet.add(s.sales_employee_id));
            }

            const salesIds = Array.from(salesIdsSet);

            // Update if we found sales
            if (salesIds.length > 0) {
              await updateAllocation(allocation.id, {
                ...allocation,
                assigned_sales_ids: salesIds,
              });
              updated++;
            }
          }

          if (updated > 0) {
            toast.success(`Đã tự động điền Sales cho ${updated} dòng phân bổ!`);
          } else {
            toast.info('Không tìm thấy Sales phù hợp với các nhóm sản phẩm đã chọn.');
          }
        } catch (error) {
          toast.error('Lỗi khi tự động điền Sales.');
        }
      },
    });
  };

  return (
    <div className="p-6 h-screen overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Phân bổ Sale</h2>
          <p className="text-slate-500 text-sm">Cấu hình tự động chia Lead theo sản phẩm và nhóm khách</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleAutoFillSales}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
            title="Tự động điền Sales dựa trên chuyên môn"
          >
            <Sparkles size={18} /> Tự động điền Sales
          </button>
          <button
            onClick={handleAutoDistribute}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-blue-600 shadow-sm transition-colors"
          >
            <Shuffle size={18} /> Tự động phân bổ Sales
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 pb-20 overflow-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <th className="p-4 w-24">Mã SP</th>
              <th className="p-4 w-40">Nhóm KH</th>
              <th className="p-4 w-1/4">Nhóm SP</th>
              <th className="p-4 w-1/4">Sale Phụ Trách</th>
              <th className="p-4 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allocations.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50/50 group">
                <td className="p-4 font-mono text-slate-500 text-sm">{item.rule_code || `#${item.id}`}</td>

                {/* 1. Nhóm Khách Hàng - Select */}
                <td className="p-4">
                  <select
                    value={item.customer_group || ''}
                    onChange={(e) => updateField(item.id, 'customer_group', e.target.value)}
                    className="bg-transparent border border-slate-200 rounded px-2 py-1 text-sm focus:border-accent outline-none w-full"
                  >
                    {CUSTOMER_GROUPS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </td>

                {/* 2. Nhóm Sản Phẩm - Tags */}
                <td className="p-4 relative popover-container">
                  <div className="flex flex-wrap gap-1">
                    {item.product_group_ids.map(pgId => {
                      const pg = productGroups.find(p => p.id === pgId);
                      return (
                        <span key={pgId} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs flex items-center gap-1">
                          {pg?.name || `ID:${pgId}`}
                          <button onClick={() => removeTag(item.id, 'product_group_ids', pgId)} className="hover:text-red-500"><X size={10} /></button>
                        </span>
                      );
                    })}
                    <button
                      onClick={() => setActivePopover({ id: item.id, type: 'group' })}
                      className="text-slate-400 hover:text-accent border border-dashed border-slate-300 rounded px-2 py-1 text-xs hover:border-accent"
                    >
                      + Thêm
                    </button>
                  </div>
                  {/* Dropdown for Groups */}
                  {activePopover?.id === item.id && activePopover.type === 'group' && (
                    <div className="absolute z-10 mt-2 w-64 bg-white rounded-lg shadow-xl border border-slate-100 p-2 animate-in fade-in zoom-in-95 max-h-80 overflow-y-auto">
                      <div className="text-xs font-semibold text-slate-400 px-2 py-1 mb-1">Chọn nhóm SP</div>
                      <div className="border-t border-slate-100 pt-1">
                        {productGroups.map(g => (
                          <button
                            key={g.id}
                            onClick={() => addTag(item.id, 'product_group_ids', g.id)}
                            className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 rounded text-slate-700"
                          >
                            {g.name}
                          </button>
                        ))}
                        {productGroups.length === 0 && <div className="p-2 text-xs text-slate-400">Chưa có nhóm nào</div>}
                      </div>
                    </div>
                  )}
                </td>

                {/* 3. Sale Phụ Trách - Tags */}
                <td className="p-4 relative popover-container">
                  <div className="flex flex-wrap gap-2">
                    {item.assigned_sales_ids.map(sId => {
                      const s = salesEmployees.find(se => se.id === sId);
                      return (
                        <span key={sId} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 border border-green-100 rounded text-xs">
                          {s?.full_name || `ID:${sId}`}
                          <button onClick={() => removeTag(item.id, 'assigned_sales_ids', sId)} className="hover:text-red-500"><X size={12} /></button>
                        </span>
                      );
                    })}
                    <button
                      onClick={() => setActivePopover({ id: item.id, type: 'sale' })}
                      className="text-slate-400 hover:text-accent border border-dashed border-slate-300 rounded px-2 py-1 text-xs hover:border-accent"
                    >
                      + Sale
                    </button>
                  </div>
                  {/* Dropdown for Sales */}
                  {activePopover?.id === item.id && activePopover.type === 'sale' && (
                    <div className="absolute right-0 z-10 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 p-1 animate-in fade-in zoom-in-95 max-h-60 overflow-y-auto">
                      <div className="text-xs font-semibold text-slate-400 px-2 py-1">Chọn nhân sự</div>
                      {salesEmployees.filter(se => se.is_active).map(emp => (
                        <button
                          key={emp.id}
                          onClick={() => addTag(item.id, 'assigned_sales_ids', emp.id)}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-slate-50 rounded text-slate-700"
                        >
                          {emp.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                </td>

                <td className="p-4 text-center">
                  <button onClick={() => handleDeleteRow(item.id)} className="text-red-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition-colors">
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="p-4 text-center border-t border-slate-100">
                <button
                  onClick={handleAddRow}
                  className="flex items-center justify-center gap-2 mx-auto text-accent hover:underline text-sm font-medium px-4 py-2 hover:bg-blue-50 rounded transition-colors"
                >
                  <Plus size={16} /> Thêm dòng phân bổ mới
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Success Modal */}
      {showSuccessModal && distributionResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[500px] max-w-[90vw] p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="text-green-600" size={32} />
              </div>

              <h3 className="text-2xl font-bold text-slate-800 mb-2">
                Phân bổ thành công!
              </h3>

              <p className="text-slate-600 mb-6">
                Đã phân bổ <span className="font-bold text-accent">{distributionResult.assignedCount}/{distributionResult.totalLeads}</span> khách hàng
              </p>

              <div className="w-full bg-slate-50 rounded-lg p-4 mb-6 space-y-2">
                {distributionResult.assignedByRule > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">📋 Theo quy tắc:</span>
                    <span className="font-bold text-slate-800">{distributionResult.assignedByRule} khách</span>
                  </div>
                )}
                {distributionResult.assignedByRoundRobin > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">🔄 Phân bổ đều:</span>
                    <span className="font-bold text-slate-800">{distributionResult.assignedByRoundRobin} khách</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    setShowSuccessModal(false);
                    router.push('/leads?filter=assigned_today');
                  }}
                  className="flex-1 px-4 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  Xem danh sách
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
