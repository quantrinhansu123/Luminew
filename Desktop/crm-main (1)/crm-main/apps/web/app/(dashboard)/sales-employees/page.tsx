'use client';

import { useState } from 'react';
import { SalesEmployee, ProductGroup } from '@/lib/types';
import { PlusCircle, Edit, Trash2, X, UserCircle, TrendingUp, Calendar, Award, Tag, Eye, RotateCcw } from 'lucide-react';
import { useProductGroups } from '@/lib/api-hooks';
import { useSalesEmployees } from '@/lib/api-hooks';
import { SalesEmployeeFormModal } from '@/components/features/sales-employees/SalesEmployeeFormModal';
import { SalesEmployeeOrdersModal } from '@/components/features/sales-employees/SalesEmployeeOrdersModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface Specialization {
  id: number;
  sales_employee_id: number;
  product_group_id: number;
  is_primary: boolean;
  product_groups: ProductGroup;
}

export default function SalesEmployeesPage() {
  const { salesEmployees: employees, loading, error, refetch: fetchEmployees } = useSalesEmployees();
  const { productGroups } = useProductGroups();

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSpecializationModalOpen, setIsSpecializationModalOpen] = useState(false);
  const [isOrdersModalOpen, setIsOrdersModalOpen] = useState(false);
  const [isRecounting, setIsRecounting] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<SalesEmployee | null>(null);
  const [selectedOrdersEmployee, setSelectedOrdersEmployee] = useState<SalesEmployee | null>(null);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Fetch specializations for an employee
  const fetchSpecializations = async (employeeId: number) => {
    try {
      const { data, error: err } = await supabase
        .from('sales_product_specializations')
        .select('id, sales_employee_id, product_group_id, is_primary, product_groups:product_group_id(*)')
        .eq('sales_employee_id', employeeId);

      if (err) throw err;
      setSpecializations((data as any) || []);
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };

  // Add specialization
  const handleAddSpecialization = async (productGroupId: number) => {
    if (!selectedEmployee) return;

    try {
      const { error: err } = await supabase.from('sales_product_specializations').insert([
        {
          sales_employee_id: selectedEmployee.id,
          product_group_id: productGroupId,
          is_primary: false,
        },
      ]);
      if (err) throw err;
      await fetchSpecializations(selectedEmployee.id);
      toast.success('Đã thêm chuyên môn thành công!');
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };

  // Remove specialization
  const handleRemoveSpecialization = async (productGroupId: number) => {
    if (!selectedEmployee) return;

    try {
      const { error: err } = await supabase
        .from('sales_product_specializations')
        .delete()
        .eq('sales_employee_id', selectedEmployee.id)
        .eq('product_group_id', productGroupId);
      if (err) throw err;

      await fetchSpecializations(selectedEmployee.id);
      toast.success('Đã xóa chuyên môn thành công!');
    } catch (err: any) {
      toast.error(`Lỗi: ${err.message}`);
    }
  };

  // Add Employee
  const handleAddEmployee = async (data: any) => {
    try {
      const { error: err } = await supabase.from('sales_employees').insert([data]);
      if (err) throw err;
      await fetchEmployees();
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  };

  // Edit Employee
  const handleEditClick = (employee: SalesEmployee) => {
    setSelectedEmployee(employee);
    setIsEditModalOpen(true);
  };

  const handleEditEmployee = async (data: any) => {
    if (!selectedEmployee) return false;

    try {
      const { error: err } = await supabase
        .from('sales_employees')
        .update(data)
        .eq('id', selectedEmployee.id);
      if (err) throw err;
      await fetchEmployees();
      return true;
    } catch (err: any) {
      console.error(err);
      return false;
    }
  };

  // Manage Specializations
  const handleManageSpecializations = async (employee: SalesEmployee) => {
    setSelectedEmployee(employee);
    await fetchSpecializations(employee.id);
    setIsSpecializationModalOpen(true);
  };

  const handleViewOrders = (employee: SalesEmployee) => {
    setSelectedOrdersEmployee(employee);
    setIsOrdersModalOpen(true);
  };

  const handleRecountLeadCounts = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    setConfirmModal({
      isOpen: true,
      title: 'Đếm lại số lead',
      message:
        'Hệ thống sẽ đếm lại số lead theo bảng leads (tổng lead + lead hôm nay theo assigned_at) ' +
        'và cập nhật vào sales_employees. Thao tác có thể mất vài giây.',
      variant: 'info',
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        if (isRecounting) return;

        setIsRecounting(true);
        try {
          let updated = 0;
          for (const emp of employees) {
            const [{ count: totalCount, error: totalErr }, { count: todayCount, error: todayErr }] =
              await Promise.all([
                supabase
                  .from('leads')
                  .select('id', { count: 'exact', head: true })
                  .eq('assigned_sales_id', emp.id),
                supabase
                  .from('leads')
                  .select('id', { count: 'exact', head: true })
                  .eq('assigned_sales_id', emp.id)
                  .gte('assigned_at', todayIso),
              ]);

            if (totalErr) throw totalErr;
            if (todayErr) throw todayErr;

            const { error: updErr } = await supabase
              .from('sales_employees')
              .update({
                total_lead_count: totalCount || 0,
                daily_lead_count: todayCount || 0,
              })
              .eq('id', emp.id);
            if (updErr) throw updErr;

            updated += 1;
          }

          await fetchEmployees();
          toast.success(`Đã đếm lại lead cho ${updated}/${employees.length} nhân viên.`);
        } catch (err: any) {
          toast.error(`Lỗi khi đếm lại lead: ${err?.message || String(err)}`);
        } finally {
          setIsRecounting(false);
        }
      },
    });
  };

  // Delete Employee (Soft delete)
  const handleDeleteEmployee = (employeeId: number, employeeName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Vô hiệu hóa nhân viên',
      message: `Bạn có chắc muốn vô hiệu hóa nhân viên "${employeeName}"?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const { error: err } = await supabase
            .from('sales_employees')
            .update({ is_active: false })
            .eq('id', employeeId);
          if (err) throw err;
          await fetchEmployees();
          toast.success('Đã vô hiệu hóa nhân viên thành công!');
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
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Quản lý Nhân viên Sale</h1>
          <p className="text-slate-500 text-sm">Quản lý danh sách nhân viên sale và chuyên môn sản phẩm</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRecountLeadCounts}
            disabled={isRecounting || employees.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition-all font-medium disabled:opacity-60"
            title="Đếm lại số lead theo bảng leads"
          >
            <RotateCcw size={18} />
            {isRecounting ? 'Đang đếm...' : 'Đếm lại lead'}
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-blue-600 shadow-md hover:shadow-lg transition-all font-medium"
          >
            <PlusCircle size={20} />
            Thêm nhân viên
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <UserCircle className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Tổng NV</p>
              <p className="text-2xl font-bold text-slate-800">{employees.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <Award className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Đang hoạt động</p>
              <p className="text-2xl font-bold text-slate-800">
                {employees.filter((e) => e.is_active).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Tổng lead hôm nay</p>
              <p className="text-2xl font-bold text-slate-800">
                {employees.reduce((sum, e) => sum + (e.daily_lead_count || 0), 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Calendar className="text-amber-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500">Tổng lead all-time</p>
              <p className="text-2xl font-bold text-slate-800">
                {employees.reduce((sum, e) => sum + (e.total_lead_count || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sales Employees Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">ID</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Mã NV</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Tên</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Email</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Điện thoại</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Chuyên môn</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Lead hôm nay</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Tổng lead</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Trạng thái</th>
              <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((employee) => (
              <tr key={employee.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-700 font-medium">#{employee.id}</td>
                <td className="px-6 py-4 text-sm font-mono text-slate-900 font-semibold">
                  {employee.employee_code}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-900">{employee.full_name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{employee.email}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{employee.phone || '-'}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleManageSpecializations(employee)}
                    className="flex items-center gap-1 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 transition-colors"
                  >
                    <Tag size={14} />
                    Quản lý
                  </button>
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-bold">
                    {employee.daily_lead_count || 0}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                    {employee.total_lead_count || 0}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      employee.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {employee.is_active ? 'Hoạt động' : 'Ngừng'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleViewOrders(employee)}
                      className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                      title="Xem lịch sử đơn hàng"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => handleEditClick(employee)}
                      className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                      title="Chỉnh sửa"
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(employee.id, employee.full_name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Vô hiệu hóa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {employees.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            Chưa có nhân viên sale nào. Nhấn "Thêm nhân viên" để bắt đầu.
          </div>
        )}
      </div>

      {/* Add/Edit Employee Modal */}
      <SalesEmployeeFormModal
        mode={isEditModalOpen ? 'edit' : 'add'}
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedEmployee(null);
        }}
        onSubmit={isEditModalOpen ? handleEditEmployee : handleAddEmployee}
        defaultValues={isEditModalOpen ? selectedEmployee : undefined}
      />

      <SalesEmployeeOrdersModal
        isOpen={isOrdersModalOpen}
        onClose={() => {
          setIsOrdersModalOpen(false);
          setSelectedOrdersEmployee(null);
        }}
        employee={selectedOrdersEmployee}
      />

      {/* Specialization Management Modal */}
      {isSpecializationModalOpen && selectedEmployee && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-[700px] max-w-[90vw] p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Tag className="text-indigo-600" />
                Quản lý chuyên môn: {selectedEmployee.full_name}
              </h3>
              <button
                onClick={() => {
                  setIsSpecializationModalOpen(false);
                  setSelectedEmployee(null);
                  setSpecializations([]);
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Current Specializations */}
              <div className="bg-indigo-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-3 text-sm">Chuyên môn hiện tại</h4>
                <div className="flex flex-wrap gap-2">
                  {specializations.length > 0 ? (
                    specializations.map((spec) => (
                      <span
                        key={spec.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-sm"
                      >
                        <span className="font-medium text-slate-700">{spec.product_groups.name}</span>
                        <button
                          onClick={() => handleRemoveSpecialization(spec.product_group_id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Chưa có chuyên môn nào</p>
                  )}
                </div>
              </div>

              {/* Add New Specialization */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-semibold text-slate-700 mb-3 text-sm">Thêm chuyên môn mới</h4>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {productGroups
                    .filter(
                      (pg) => !specializations.some((spec) => spec.product_group_id === pg.id)
                    )
                    .map((group) => (
                      <button
                        key={group.id}
                        onClick={() => handleAddSpecialization(group.id)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-300 transition-colors text-left"
                      >
                        {group.name}
                      </button>
                    ))}
                  {productGroups.filter(
                    (pg) => !specializations.some((spec) => spec.product_group_id === pg.id)
                  ).length === 0 && (
                    <p className="col-span-2 text-sm text-slate-500">
                      Đã thêm tất cả nhóm sản phẩm
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setIsSpecializationModalOpen(false);
                  setSelectedEmployee(null);
                  setSpecializations([]);
                }}
                className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
              >
                Hoàn tất
              </button>
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
