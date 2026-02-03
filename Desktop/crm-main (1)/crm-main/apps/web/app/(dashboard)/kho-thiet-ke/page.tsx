'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Loader2,
  FileIcon,
  Image as ImageIcon,
  X,
  Eye,
  ChevronLeft,
  ChevronRight,
  Link2,
  Copy,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface GalleryOrder {
  id: number;
  order_code: string;
  customer_name: string;
  thumbnail_url: string | null;
  google_drive_id: string | null;
  file_count: number;
  status: string;
  created_at: string;
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

interface OrderDetail {
  id: number;
  order_code: string;
  description?: string;
  customers: {
    full_name: string;
    phone: string;
  };
  request_files: DesignFile[];
  result_files: DesignFile[];
}

const statusLabels: Record<string, string> = {
  pending: 'Chờ xử lý',
  designing: 'Đang thiết kế',
  approved: 'Đã duyệt',
  printing: 'Đang in',
  completed: 'Hoàn thành',
  delivered: 'Đã giao',
};

export default function DesignGalleryPage() {
  const [orders, setOrders] = useState<GalleryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const limit = 20;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchGallery = useCallback(async () => {
    try {
      setIsLoading(true);
      const offset = (page - 1) * limit;
      let query = supabase
        .from('orders')
        .select(
          `
          id,
          order_code,
          status,
          created_at,
          customers:customer_id(full_name),
          design_files(id, order_id, thumbnail_url, google_drive_id, file_category)
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (debouncedSearch) {
        // Search by order code or customer name
        query = query.or(`order_code.ilike.%${debouncedSearch}%,customers.full_name.ilike.%${debouncedSearch}%`);
      }

      const { data, error: err, count } = await query;
      if (err) throw err;

      const mapped: GalleryOrder[] = (data || []).map((o: any) => {
        const designFiles = Array.isArray(o.design_files) ? o.design_files : (o.design_files ? [o.design_files] : []);
        // Find first image thumbnail (prefer result files, then request files)
        const resultThumbnail = designFiles.find((f: any) => f.file_category === 'result' && f.thumbnail_url);
        const requestThumbnail = designFiles.find((f: any) => f.thumbnail_url);
        const thumbnail = resultThumbnail?.thumbnail_url || requestThumbnail?.thumbnail_url || null;
        const driveId = resultThumbnail?.google_drive_id || requestThumbnail?.google_drive_id || null;
        
        return {
          id: o.id,
          order_code: o.order_code,
          customer_name: o.customers?.full_name || '',
          thumbnail_url: thumbnail,
          google_drive_id: driveId,
          file_count: designFiles.length,
          status: o.status,
          created_at: o.created_at,
        };
      });

      setOrders(mapped);
      setTotal(count || 0);
    } catch (error) {
      console.error('Error fetching gallery:', error);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  const handleViewOrder = async (orderId: number) => {
    try {
      setIsLoadingDetail(true);
      const [orderRes, filesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_code, description, customers:customer_id(full_name, phone)')
          .eq('id', orderId)
          .single(),
        supabase
          .from('design_files')
          .select('id, file_name, file_type, google_drive_id, thumbnail_url, file_category, created_at')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false }),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (filesRes.error) throw filesRes.error;

      const files: DesignFile[] = (filesRes.data || []) as any;
      const request_files = files.filter((f) => (f.file_category || 'request') === 'request');
      const result_files = files.filter((f) => f.file_category === 'result');

      const customer =
        Array.isArray((orderRes.data as any).customers) ? (orderRes.data as any).customers[0] : (orderRes.data as any).customers;

      const detail: OrderDetail = {
        id: orderRes.data.id,
        order_code: orderRes.data.order_code,
        description: orderRes.data.description,
        customers: customer,
        request_files,
        result_files,
      };
      setSelectedOrder(detail);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCopyLink = async (googleDriveId: string, fileName: string) => {
    if (!googleDriveId) {
      toast.error('Không có link');
      return;
    }
    
    const link = `https://drive.google.com/file/d/${googleDriveId}/view`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLinkId(googleDriveId);
      toast.success(`Đã copy link: ${fileName}`);
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch (error) {
      toast.error('Không thể copy link');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kho Thiết Kế</h1>
        <p className="text-gray-500">
          Thư viện thiết kế theo đơn hàng. Tìm kiếm theo mã đơn hoặc tên khách hàng.
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

      {/* Gallery Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>Không tìm thấy đơn hàng nào</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => handleViewOrder(order.id)}
                className="bg-white rounded-lg border shadow-sm hover:shadow-lg transition-shadow cursor-pointer group"
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-gray-100 rounded-t-lg overflow-hidden relative">
                  {order.thumbnail_url ? (
                    <img
                      src={order.thumbnail_url}
                      alt={order.order_code}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileIcon className="w-12 h-12 text-gray-300" />
                    </div>
                  )}

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewOrder(order.id);
                      }}
                      className="p-2 bg-white rounded-full hover:bg-blue-50 transition-colors"
                      title="Xem chi tiết"
                    >
                      <Eye className="w-5 h-5 text-gray-700" />
                    </button>
                    {order.google_drive_id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyLink(order.google_drive_id!, `${order.order_code} - ${order.customer_name}`);
                        }}
                        className="p-2 bg-white rounded-full hover:bg-green-50 transition-colors"
                        title="Lấy link"
                      >
                        {copiedLinkId === order.google_drive_id ? (
                          <Check className="w-5 h-5 text-green-600" />
                        ) : (
                          <Link2 className="w-5 h-5 text-gray-700" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* File count badge */}
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    {order.file_count} file
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="font-semibold text-blue-600 text-sm truncate">
                    {order.order_code}
                  </h3>
                  <p className="text-gray-700 text-sm truncate mt-1">
                    {order.customer_name || 'Khách hàng'}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        order.status === 'completed' || order.status === 'delivered'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {statusLabels[order.status] || order.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Trang {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-slate-50">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">
                  {selectedOrder.order_code}
                </h2>
                <div className="flex items-center gap-2">
                  <p className="text-base text-slate-600 font-medium">
                    {selectedOrder.customers?.full_name || 'Khách hàng'}
                  </p>
                  <span className="text-slate-400">•</span>
                  <p className="text-base text-slate-600">
                    {selectedOrder.customers?.phone || '-'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors ml-4"
              >
                <X className="w-6 h-6 text-slate-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingDetail ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="p-6 space-y-8">
                  {/* Description */}
                  {selectedOrder.description && (
                    <div className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Mô tả</h3>
                      <p className="text-base text-slate-800 leading-relaxed">{selectedOrder.description}</p>
                    </div>
                  )}

                  {/* Request Files */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-lg font-bold text-slate-900">
                        Tài liệu yêu cầu
                      </h3>
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                        {selectedOrder.request_files?.length || 0}
                      </span>
                    </div>
                    {selectedOrder.request_files?.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        {selectedOrder.request_files.map((file) => (
                          <div
                            key={file.id}
                            className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-blue-300 hover:shadow-lg transition-all duration-200 group"
                          >
                            {/* Thumbnail */}
                            <div className="aspect-square bg-slate-100 rounded-lg overflow-hidden mb-3 relative">
                              {file.thumbnail_url ? (
                                <img
                                  src={file.thumbnail_url}
                                  alt={file.file_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileIcon className="w-12 h-12 text-slate-300" />
                                </div>
                              )}
                            </div>
                            
                            {/* File Name */}
                            <p className="text-sm font-medium text-slate-700 truncate mb-3 text-center min-h-[20px]">
                              {file.file_name}
                            </p>
                            
                            {/* Action Buttons */}
                            {file.google_drive_id && (
                              <div className="flex gap-2">
                                <a
                                  href={`https://drive.google.com/file/d/${file.google_drive_id}/view`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                  title="Mở trong Google Drive"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>Xem</span>
                                </a>
                                <button
                                  onClick={() => handleCopyLink(file.google_drive_id!, file.file_name)}
                                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                                    copiedLinkId === file.google_drive_id
                                      ? 'bg-green-600 hover:bg-green-700 text-white'
                                      : 'bg-green-100 hover:bg-green-200 text-green-700'
                                  }`}
                                  title="Copy link"
                                >
                                  {copiedLinkId === file.google_drive_id ? (
                                    <>
                                      <Check className="w-4 h-4" />
                                      <span>Đã copy</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-8 text-center">
                        <FileIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">Chưa có file yêu cầu</p>
                      </div>
                    )}
                  </div>

                  {/* Result Files */}
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <h3 className="text-lg font-bold text-slate-900">
                        Kết quả thiết kế
                      </h3>
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                        {selectedOrder.result_files?.length || 0}
                      </span>
                    </div>
                    {selectedOrder.result_files?.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        {selectedOrder.result_files.map((file) => (
                          <div
                            key={file.id}
                            className="bg-white border-2 border-green-200 rounded-xl p-4 hover:border-green-400 hover:shadow-lg transition-all duration-200 group"
                          >
                            {/* Thumbnail */}
                            <div className="aspect-square bg-green-50 rounded-lg overflow-hidden mb-3 relative">
                              {file.thumbnail_url ? (
                                <img
                                  src={file.thumbnail_url}
                                  alt={file.file_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <FileIcon className="w-12 h-12 text-green-300" />
                                </div>
                              )}
                            </div>
                            
                            {/* File Name */}
                            <p className="text-sm font-medium text-slate-700 truncate mb-3 text-center min-h-[20px]">
                              {file.file_name}
                            </p>
                            
                            {/* Action Buttons */}
                            {file.google_drive_id && (
                              <div className="flex gap-2">
                                <a
                                  href={`https://drive.google.com/file/d/${file.google_drive_id}/view`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                                  title="Mở trong Google Drive"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span>Xem</span>
                                </a>
                                <button
                                  onClick={() => handleCopyLink(file.google_drive_id!, file.file_name)}
                                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                                    copiedLinkId === file.google_drive_id
                                      ? 'bg-green-600 hover:bg-green-700 text-white'
                                      : 'bg-green-100 hover:bg-green-200 text-green-700'
                                  }`}
                                  title="Copy link"
                                >
                                  {copiedLinkId === file.google_drive_id ? (
                                    <>
                                      <Check className="w-4 h-4" />
                                      <span>Đã copy</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-4 h-4" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
                        <FileIcon className="w-12 h-12 text-green-300 mx-auto mb-3" />
                        <p className="text-green-600 font-medium">Chưa có kết quả</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
