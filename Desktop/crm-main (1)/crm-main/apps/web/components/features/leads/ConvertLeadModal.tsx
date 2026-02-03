'use client';

import { useState, useCallback } from 'react';
import { X, Link2, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { Lead } from '@/lib/types';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { generateCustomerCode, generateOrderCode } from '@/lib/codegen';

function extractGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Common formats:
  // - https://drive.google.com/file/d/<id>/view
  // - https://drive.google.com/open?id=<id>
  // - ...?id=<id>
  const byQuery = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byQuery?.[1]) return byQuery[1];

  const byPath = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath?.[1]) return byPath[1];

  // If user pasted only the fileId
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

interface DriveFile {
  fileId: string;
  thumbnailUrl: string;
  viewUrl: string;
  fileName?: string;
}

interface ConvertLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onSuccess: () => void;
}

export function ConvertLeadModal({
  isOpen,
  onClose,
  lead,
  onSuccess,
}: ConvertLeadModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [driveLinks, setDriveLinks] = useState<DriveFile[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // Customer form data (prefilled from lead)
  const [customerData, setCustomerData] = useState({
    full_name: lead.full_name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    address: '',
    company_name: '',
    tax_code: '',
  });

  // Order form data
  const [orderData, setOrderData] = useState({
    description: lead.demand || '',
    total_amount: 0,
    quantity: 1,
    unit: 'cái',
  });

  const handleAddLink = useCallback(async () => {
    if (!linkInput.trim()) return;

    setIsParsing(true);
    try {
      const fileId = extractGoogleDriveFileId(linkInput);
      if (!fileId) {
        toast.error('Link không hợp lệ. Vui lòng kiểm tra lại.');
        return;
      }

      const result: DriveFile = {
        fileId,
        thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}`,
        viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
        fileName: `file-${fileId.slice(0, 8)}`,
      };

      // Check if already added
      if (driveLinks.some((f) => f.fileId === result.fileId)) {
        toast.error('Link này đã được thêm');
        return;
      }

      setDriveLinks((prev) => [...prev, result]);
      setLinkInput('');
      toast.success('Đã thêm link');
    } catch (error) {
      console.error('Parse error:', error);
      toast.error('Lỗi khi xử lý link');
    } finally {
      setIsParsing(false);
    }
  }, [linkInput, driveLinks]);

  const handleRemoveLink = useCallback((fileId: string) => {
    setDriveLinks((prev) => prev.filter((f) => f.fileId !== fileId));
  }, []);

  const handleSubmit = async () => {
    if (!orderData.description) {
      toast.error('Vui lòng nhập mô tả đơn hàng');
      return;
    }
    if (orderData.total_amount <= 0) {
      toast.error('Vui lòng nhập tổng tiền hợp lệ');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1) Load lead (fresh) & validate
      const { data: leadRow, error: leadErr } = await supabase
        .from('leads')
        .select(
          'id, full_name, phone, email, assigned_sales_id, interested_product_group_id, status, is_converted'
        )
        .eq('id', lead.id)
        .single();

      if (leadErr) throw leadErr;
      if (!leadRow) throw new Error('Lead not found');

      if (leadRow.status !== 'closed') {
        throw new Error('Chỉ có thể tạo đơn hàng cho lead đã chốt (status = closed)');
      }
      if (leadRow.is_converted) {
        throw new Error('Lead đã được chuyển đổi trước đó');
      }

      // 2) Find or create customer by phone
      const phoneToUse = customerData.phone || leadRow.phone;
      const { data: existingCustomer, error: findCustomerErr } = await supabase
        .from('customers')
        .select('id, customer_code')
        .eq('phone', phoneToUse)
        .maybeSingle();

      if (findCustomerErr) throw findCustomerErr;

      let customer = existingCustomer;
      if (!customer) {
        const { data: newCustomer, error: createCustomerErr } = await supabase
          .from('customers')
          .insert([
            {
              customer_code: generateCustomerCode(),
              full_name: customerData.full_name || leadRow.full_name,
              phone: phoneToUse,
              email: customerData.email || leadRow.email,
              address: customerData.address || null,
              company_name: customerData.company_name || null,
              tax_code: customerData.tax_code || null,
              original_lead_id: leadRow.id,
              account_manager_id: leadRow.assigned_sales_id ?? null,
            },
          ])
          .select('id, customer_code')
          .single();

        if (createCustomerErr) throw createCustomerErr;
        customer = newCustomer;
      }

      // 3) Create order
      const { data: createdOrder, error: createOrderErr } = await supabase
        .from('orders')
        .insert([
          {
            order_code: generateOrderCode(),
            customer_id: customer.id,
            product_group_id: leadRow.interested_product_group_id ?? null,
            description: orderData.description,
            quantity: orderData.quantity || 1,
            unit: orderData.unit || 'cái',
            total_amount: Number(orderData.total_amount),
            final_amount: Number(orderData.total_amount),
            status: 'pending',
            sales_employee_id: leadRow.assigned_sales_id ?? null,
          },
        ])
        .select('id, order_code')
        .single();

      if (createOrderErr) throw createOrderErr;

      // 4) Link design files (Google Drive ids) if provided
      if (driveLinks.length > 0) {
        const filesPayload = driveLinks.map((f) => ({
          customer_id: customer.id,
          order_id: createdOrder.id,
          file_name: f.fileName || `file-${f.fileId.slice(0, 8)}`,
          storage_path: `gdrive://${f.fileId}`,
          google_drive_id: f.fileId,
          thumbnail_url: f.thumbnailUrl,
          file_category: 'request',
        }));

        const { error: insertFilesErr } = await supabase.from('design_files').insert(filesPayload);
        if (insertFilesErr) throw insertFilesErr;
      }

      // 5) Update lead as converted
      const { error: updateLeadErr } = await supabase
        .from('leads')
        .update({
          is_converted: true,
          converted_at: new Date().toISOString(),
          converted_customer_id: customer.id,
        })
        .eq('id', leadRow.id);

      if (updateLeadErr) throw updateLeadErr;

      toast.success(
        <div>
          <p>Đã tạo khách hàng và đơn hàng thành công!</p>
          <p className="text-sm text-gray-500">
            Mã đơn: {createdOrder.order_code || `#${createdOrder.id}`}
          </p>
        </div>
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Convert error:', error);
      toast.error(error.message || 'Có lỗi xảy ra');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            Tạo Khách hàng + Đơn hàng
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-6">
          {/* Customer Section */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">
              Thông tin khách hàng
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Họ tên *
                </label>
                <input
                  type="text"
                  value={customerData.full_name}
                  onChange={(e) =>
                    setCustomerData((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Số điện thoại *
                </label>
                <input
                  type="text"
                  value={customerData.phone}
                  onChange={(e) =>
                    setCustomerData((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={customerData.email}
                  onChange={(e) =>
                    setCustomerData((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Công ty
                </label>
                <input
                  type="text"
                  value={customerData.company_name}
                  onChange={(e) =>
                    setCustomerData((prev) => ({
                      ...prev,
                      company_name: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-gray-600 mb-1">
                  Địa chỉ
                </label>
                <input
                  type="text"
                  value={customerData.address}
                  onChange={(e) =>
                    setCustomerData((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Order Section */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">
              Thông tin đơn hàng
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Mô tả đơn hàng *
                </label>
                <textarea
                  value={orderData.description}
                  onChange={(e) =>
                    setOrderData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Mô tả chi tiết yêu cầu thiết kế..."
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Số lượng
                  </label>
                  <input
                    type="number"
                    value={orderData.quantity}
                    onChange={(e) =>
                      setOrderData((prev) => ({
                        ...prev,
                        quantity: parseInt(e.target.value) || 1,
                      }))
                    }
                    min={1}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Đơn vị
                  </label>
                  <input
                    type="text"
                    value={orderData.unit}
                    onChange={(e) =>
                      setOrderData((prev) => ({
                        ...prev,
                        unit: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Tổng tiền (VNĐ) *
                  </label>
                  <input
                    type="number"
                    value={orderData.total_amount}
                    onChange={(e) =>
                      setOrderData((prev) => ({
                        ...prev,
                        total_amount: parseFloat(e.target.value) || 0,
                      }))
                    }
                    min={0}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Drive Links Section */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">
              Tài liệu đính kèm (Google Drive)
            </h3>

            {/* Add Link Input */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                  placeholder="Paste link Google Drive..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={handleAddLink}
                disabled={isParsing || !linkInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isParsing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Thêm'
                )}
              </button>
            </div>

            {/* Links List */}
            {driveLinks.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {driveLinks.map((file) => (
                  <div
                    key={file.fileId}
                    className="relative group bg-gray-50 rounded-lg overflow-hidden"
                  >
                    <img
                      src={file.thumbnailUrl}
                      alt="Thumbnail"
                      className="w-full aspect-square object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239ca3af" font-size="12">No preview</text></svg>';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a
                        href={file.viewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white rounded-full hover:bg-gray-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleRemoveLink(file.fileId)}
                        className="p-2 bg-white rounded-full hover:bg-gray-100 text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2">
              Upload file lên Google Drive, sau đó copy link và paste vào đây.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Huỷ
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Tạo đơn hàng
          </button>
        </div>
      </div>
    </div>
  );
}
