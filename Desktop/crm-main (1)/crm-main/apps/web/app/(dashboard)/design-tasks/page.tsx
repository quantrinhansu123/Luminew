'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Loader2,
  FileIcon,
  Eye,
  X,
  CheckCircle,
  Clock,
  Link2,
  ExternalLink,
  Trash2,
  FileText,
  Image as ImageIcon,
  PlusCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

function extractGoogleDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const byQuery = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byQuery?.[1]) return byQuery[1];
  const byPath = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath?.[1]) return byPath[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

interface Order {
  id: number;
  order_code: string;
  customer_id?: number;
  description?: string;
  status: string;
  created_at: string;
  customers: {
    full_name: string;
    phone: string;
  };
  design_files: DesignFile[];
}

interface OrderDetail extends Order {
  request_files: DesignFile[];
  result_files: DesignFile[];
}

interface DesignFile {
  id: number;
  file_name: string;
  file_type?: string;
  google_drive_id?: string;
  thumbnail_url?: string;
  file_category?: string;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  pending: 'Chờ xử lý',
  designing: 'Đang thiết kế',
  approved: 'Đã duyệt',
  printing: 'Đang in',
  completed: 'Hoàn thành',
};

export default function DesignTasksPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [fileNameInput, setFileNameInput] = useState('');
  const [thumbnailLinkInput, setThumbnailLinkInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          order_code,
          customer_id,
          description,
          status,
          created_at,
          customers:customer_id(full_name, phone),
          design_files(*)
        `
        )
        .in('status', ['pending', 'designing'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders((data as any) || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = orders.filter(
    (order) =>
      order.order_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customers?.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddDesignResult = async (orderId: number) => {
    if (!linkInput.trim()) return;

    setIsParsing(true);
    try {
      const fileId = extractGoogleDriveFileId(linkInput);
      if (!fileId) {
        toast.error('Link không hợp lệ');
        return;
      }

      setIsAdding(true);

      // Need customer_id for design_files row
      const { data: orderRow, error: orderErr } = await supabase
        .from('orders')
        .select('id, customer_id')
        .eq('id', orderId)
        .single();
      if (orderErr) throw orderErr;

      // Extract thumbnail ID from thumbnail link if provided, otherwise use main file ID
      let thumbnailUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
      if (thumbnailLinkInput.trim()) {
        const thumbnailId = extractGoogleDriveFileId(thumbnailLinkInput);
        if (thumbnailId) {
          // Use high quality thumbnail with max size
          thumbnailUrl = `https://drive.google.com/thumbnail?id=${thumbnailId}&sz=w2000`;
        }
      }

      const { error: insertErr } = await supabase.from('design_files').insert([
        {
          customer_id: orderRow.customer_id,
          order_id: orderId,
          file_name: fileNameInput.trim() || `result-${fileId.slice(0, 8)}`,
          storage_path: `gdrive://${fileId}`,
          google_drive_id: fileId,
          thumbnail_url: thumbnailUrl,
          file_category: 'result',
        },
      ]);
      if (insertErr) throw insertErr;

      toast.success('Đã thêm kết quả thiết kế');
      setLinkInput('');
      setFileNameInput('');
      setThumbnailLinkInput('');

      // Refresh order detail
      await handleViewOrder(orderId);
      fetchOrders();
    } catch (error) {
      console.error('Error adding result:', error);
      toast.error('Lỗi khi thêm kết quả');
    } finally {
      setIsParsing(false);
      setIsAdding(false);
    }
  };

  const handleViewOrder = async (orderId: number) => {
    try {
      const [orderRes, filesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_code, customer_id, description, status, created_at, customers:customer_id(full_name, phone)')
          .eq('id', orderId)
          .single(),
        supabase
          .from('design_files')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),
      ]);
      if (orderRes.error) throw orderRes.error;
      if (filesRes.error) throw filesRes.error;

      const files: DesignFile[] = (filesRes.data || []) as any;
      const detail: OrderDetail = {
        ...(orderRes.data as any),
        design_files: files,
        request_files: files.filter((f) => (f.file_category || 'request') === 'request'),
        result_files: files.filter((f) => f.file_category === 'result'),
      };

      setSelectedOrder(detail);
      setLinkInput('');
      setFileNameInput('');
    } catch (error) {
      console.error('Error fetching order:', error);
    }
  };

  const handleDeleteFile = async (orderId: number, fileId: number) => {
    try {
      const { error } = await supabase.from('design_files').delete().eq('id', fileId).eq('order_id', orderId);
      if (error) throw error;
      toast.success('Đã xóa file');
      await handleViewOrder(orderId);
      fetchOrders();
    } catch (error) {
      console.error('Error deleting file:', error);
      toast.error('Lỗi khi xóa file');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Yêu Cầu Thiết Kế</h1>
        <p className="text-gray-500">
          Danh sách đơn hàng cần thiết kế. Thêm kết quả thiết kế cho từng đơn.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm theo mã đơn, tên khách hàng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Không có đơn hàng nào cần thiết kế
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const requestFiles = order.design_files?.filter(
              (f) => f.file_category === 'request'
            );
            const resultFiles = order.design_files?.filter(
              (f) => f.file_category === 'result'
            );

            return (
              <div
                key={order.id}
                className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-blue-600">
                        {order.order_code}
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                        {statusLabels[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-gray-900 font-medium">
                      {order.customers?.full_name}
                    </p>
                    {order.description && (
                      <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                        {order.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <FileIcon className="w-4 h-4" />
                        {requestFiles?.length || 0} file yêu cầu
                      </span>
                      <span className="flex items-center gap-1">
                        {resultFiles?.length > 0 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                        {resultFiles?.length || 0} kết quả
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleViewOrder(order.id)}
                    className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
                    title="Xem chi tiết"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50/50 to-slate-50">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-slate-900 truncate">
                  {selectedOrder.order_code}
                </h2>
                <p className="text-sm text-slate-600 mt-0.5 truncate">
                  {selectedOrder.customers?.full_name || 'Khách hàng'}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="ml-4 p-2 hover:bg-slate-200 rounded-lg transition-colors shrink-0"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                {/* Description */}
                {selectedOrder.description && (
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">Mô tả</h3>
                    <p className="text-sm text-slate-800 leading-relaxed">{selectedOrder.description}</p>
                  </div>
                )}

                {/* Request Files */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-base font-bold text-slate-900">Tài liệu yêu cầu</h3>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                      {selectedOrder.request_files?.length || 0}
                    </span>
                  </div>
                  {selectedOrder.request_files?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedOrder.request_files.map((file: DesignFile) => (
                        <a
                          key={file.id}
                          href={`https://drive.google.com/file/d/${file.google_drive_id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-col items-center p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
                        >
                          <div className="w-16 h-16 bg-slate-100 rounded-lg overflow-hidden mb-2 flex items-center justify-center">
                            {file.thumbnail_url ? (
                              <img
                                src={file.thumbnail_url}
                                alt={file.file_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <FileIcon className="w-8 h-8 text-slate-300" />
                            )}
                          </div>
                          <span className="text-xs text-slate-700 truncate w-full text-center font-medium group-hover:text-blue-700">
                            {file.file_name}
                          </span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-center">
                      <FileIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">Chưa có file yêu cầu</p>
                    </div>
                  )}
                </div>

                {/* Result Files */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-base font-bold text-slate-900">Kết quả thiết kế</h3>
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                      {selectedOrder.result_files?.length || 0}
                    </span>
                  </div>
                  {selectedOrder.result_files?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {selectedOrder.result_files.map((file: DesignFile) => (
                        <div
                          key={file.id}
                          className="relative group flex flex-col items-center p-3 bg-green-50 border border-green-200 rounded-lg hover:border-green-400 hover:shadow-md transition-all"
                        >
                          <div className="w-16 h-16 bg-green-100 rounded-lg overflow-hidden mb-2 flex items-center justify-center">
                            {file.thumbnail_url ? (
                              <img
                                src={file.thumbnail_url}
                                alt={file.file_name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <FileIcon className="w-8 h-8 text-green-300" />
                            )}
                          </div>
                          <span className="text-xs text-slate-700 truncate w-full text-center font-medium">
                            {file.file_name}
                          </span>

                          {/* Hover actions */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                            <a
                              href={`https://drive.google.com/file/d/${file.google_drive_id}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-white rounded hover:bg-slate-100"
                              title="Mở"
                            >
                              <ExternalLink className="w-4 h-4 text-slate-700" />
                            </a>
                            <button
                              onClick={() => handleDeleteFile(selectedOrder.id, file.id)}
                              className="p-1.5 bg-white rounded hover:bg-red-50"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center mb-4">
                      <FileIcon className="w-10 h-10 text-green-300 mx-auto mb-2" />
                      <p className="text-xs text-green-600">Chưa có kết quả</p>
                    </div>
                  )}

                  {/* Add result form */}
                  <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-5 border-2 border-green-200">
                    <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <PlusCircle className="w-4 h-4 text-green-600" />
                      Thêm kết quả thiết kế
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      {/* Link Google Drive */}
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-blue-600" />
                          Link Google Drive <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={linkInput}
                          onChange={(e) => setLinkInput(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleAddDesignResult(selectedOrder.id)
                          }
                          placeholder="Dán link Google Drive của file thiết kế..."
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                        />
                      </div>

                      {/* Link ảnh đại diện */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
                          Link ảnh đại diện
                        </label>
                        <input
                          type="text"
                          value={thumbnailLinkInput}
                          onChange={(e) => setThumbnailLinkInput(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleAddDesignResult(selectedOrder.id)
                          }
                          placeholder="Dán link ảnh đại diện..."
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm bg-white"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Nếu không nhập, hệ thống tự dùng ảnh từ file chính
                        </p>
                      </div>

                      {/* Tên file */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-green-600" />
                          Tên file
                        </label>
                        <input
                          type="text"
                          value={fileNameInput}
                          onChange={(e) => setFileNameInput(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleAddDesignResult(selectedOrder.id)
                          }
                          placeholder="Nhập tên file (tùy chọn)..."
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm bg-white"
                        />
                      </div>

                      {/* Submit button */}
                      <div className="col-span-2">
                        <button
                          onClick={() => handleAddDesignResult(selectedOrder.id)}
                          disabled={isParsing || isAdding || !linkInput.trim()}
                          className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold text-sm shadow-md hover:shadow-lg transition-all"
                        >
                          {(isParsing || isAdding) ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Đang thêm...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>Thêm kết quả</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
