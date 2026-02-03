'use client';

import { use, useEffect, useState } from 'react';
import { DesignTemplate, UploadedFile } from '@/types/design';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Download,
  Copy,
  FileImage,
  Upload,
  X,
  Tag,
  Calendar,
  User,
  Phone,
  Package,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  bag: 'Túi',
  box: 'Hộp',
  card: 'Thiệp',
  label: 'Nhãn',
  other: 'Khác'
};

export default function DesignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [editData, setEditData] = useState<Partial<DesignTemplate>>({});
  const [tagInput, setTagInput] = useState('');

  const [template, setTemplate] = useState<DesignTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mapTemplateFromDb = (row: any): DesignTemplate => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    type: row.type,
    category: row.category ?? undefined,
    tags: row.tags || [],
    thumbnailUrl: row.thumbnail_url ?? undefined,
    fileUrls: row.file_urls ?? undefined,
    dimensions: row.dimensions ?? undefined,
    paperWeight: row.paper_weight ?? undefined,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    sourceOrderId: row.source_order_id ?? undefined,
    notes: row.notes ?? undefined,
    isPublic: Boolean(row.is_public),
    usageCount: Number(row.usage_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  useEffect(() => {
    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const { data, error: err } = await supabase
          .from('design_templates')
          .select('*')
          .eq('id', id)
          .single();
        if (err) throw err;
        setTemplate(mapTemplateFromDb(data));
      } catch (e: any) {
        setError(e?.message || 'Không tìm thấy thiết kế');
        setTemplate(null);
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [id]);

  const handleUpdate = async () => {
    if (!template) return;
    try {
      const dbUpdates: any = {};
      if (editData.name !== undefined) dbUpdates.name = editData.name;
      if (editData.description !== undefined) dbUpdates.description = editData.description || null;
      if (editData.type !== undefined) dbUpdates.type = editData.type;
      if (editData.category !== undefined) dbUpdates.category = editData.category || null;
      if (editData.tags !== undefined) dbUpdates.tags = editData.tags;
      if (editData.notes !== undefined) dbUpdates.notes = editData.notes || null;
      if (editData.isPublic !== undefined) dbUpdates.is_public = editData.isPublic;

      const { data, error: err } = await supabase
        .from('design_templates')
        .update(dbUpdates)
        .eq('id', template.id)
        .select('*')
        .single();
      if (err) throw err;

      setTemplate(mapTemplateFromDb(data));
      toast.success('Đã cập nhật thiết kế');
      setShowEditModal(false);
      setEditData({});
    } catch (e: any) {
      toast.error(e?.message || 'Cập nhật thất bại');
    }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (confirm('Bạn có chắc muốn xóa thiết kế này?')) {
      const { error: err } = await supabase.from('design_templates').delete().eq('id', template.id);
      if (err) {
        toast.error(err.message || 'Xóa thất bại');
        return;
      }
      toast.success('Đã xóa thiết kế');
      router.push('/design-library');
    }
  };

  const handleCopyToOrder = async () => {
    if (!template) return;
    // Increment usage count (best-effort)
    await supabase
      .from('design_templates')
      .update({ usage_count: (template.usageCount || 0) + 1 })
      .eq('id', template.id);
    setTemplate({ ...template, usageCount: (template.usageCount || 0) + 1 });

    // Navigate to design order creation with template data
    router.push(`/design-tasks?templateId=${template.id}`);
  };

  const addTag = () => {
    if (tagInput.trim() && !editData.tags?.includes(tagInput.trim())) {
      setEditData(prev => ({
        ...prev,
        tags: [...(prev.tags || template?.tags || []), tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setEditData(prev => ({
      ...prev,
      tags: (prev.tags || template?.tags || []).filter(t => t !== tag)
    }));
  };

  const openEditModal = () => {
    setEditData({
      name: template?.name,
      description: template?.description,
      type: template?.type,
      category: template?.category,
      tags: template?.tags,
      notes: template?.notes,
      isPublic: template?.isPublic
    });
    setShowEditModal(true);
  };

  const images = (template?.fileUrls as UploadedFile[])?.filter(f =>
    f.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
  ) || [];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="text-slate-500">Đang tải...</div>
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-red-500">
          {error || 'Không tìm thấy thiết kế'}
        </div>
        <button
          onClick={() => router.push('/design-library')}
          className="mx-auto block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/design-library')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          Quay lại
        </button>

        <div className="flex gap-2">
          <button
            onClick={handleCopyToOrder}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Sử dụng mẫu này
          </button>
          <button
            onClick={openEditModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Chỉnh sửa
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Xóa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Images */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
              {template.thumbnailUrl ? (
                <>
                  <img
                    src={template.thumbnailUrl}
                    alt={template.name}
                    className="w-full h-full object-contain cursor-pointer"
                    onClick={() => setShowImageViewer(true)}
                  />
                  <button
                    onClick={() => setShowImageViewer(true)}
                    className="absolute top-4 right-4 p-2 bg-white rounded-full shadow hover:bg-gray-100"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <FileImage className="w-24 h-24 text-gray-300" />
              )}
            </div>
          </div>

          {/* File List */}
          {template.fileUrls && (template.fileUrls as UploadedFile[]).length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-medium mb-3">Files ({(template.fileUrls as UploadedFile[]).length})</h3>
              <div className="space-y-2">
                {(template.fileUrls as UploadedFile[]).map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm truncate flex-1">{file.originalName}</span>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-gray-200 rounded"
                      title="Tải xuống"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold mb-2">{template.name}</h1>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <Package className="w-4 h-4" />
              <span>{TYPE_LABELS[template.type]}</span>
              {template.category && (
                <>
                  <span>•</span>
                  <span>{template.category}</span>
                </>
              )}
            </div>

            {template.description && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Mô tả</h3>
                <p className="text-gray-600">{template.description}</p>
              </div>
            )}

            {template.tags.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Tag className="w-4 h-4" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {template.tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 py-4 border-t">
              <div>
                <div className="text-sm text-gray-500">Số lần sử dụng</div>
                <div className="text-lg font-semibold">{template.usageCount}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Trạng thái</div>
                <div className="text-lg font-semibold">
                  {template.isPublic ? (
                    <span className="text-green-600">Công khai</span>
                  ) : (
                    <span className="text-gray-600">Riêng tư</span>
                  )}
                </div>
              </div>
            </div>

            {(template.customerName || template.customerPhone) && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Thông tin khách hàng</h3>
                {template.customerName && (
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span>{template.customerName}</span>
                  </div>
                )}
                {template.customerPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{template.customerPhone}</span>
                  </div>
                )}
              </div>
            )}

            {template.notes && (
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-1">Ghi chú</h3>
                <p className="text-sm text-gray-600">{template.notes}</p>
              </div>
            )}

            <div className="border-t pt-4 flex items-center gap-2 text-sm text-gray-500">
              <Calendar className="w-4 h-4" />
              <span>Tạo: {new Date(template.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Image Viewer Modal */}
      {showImageViewer && images.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <button
            onClick={() => setShowImageViewer(false)}
            className="absolute top-4 right-4 p-2 bg-white rounded-full hover:bg-gray-100"
          >
            <X className="w-6 h-6" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-4 p-2 bg-white rounded-full hover:bg-gray-100"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-4 p-2 bg-white rounded-full hover:bg-gray-100"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="max-w-5xl max-h-[90vh] p-4">
            <img
              src={images[currentImageIndex].url}
              alt={images[currentImageIndex].originalName}
              className="w-full h-full object-contain"
            />
            <div className="text-white text-center mt-4">
              {currentImageIndex + 1} / {images.length}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Chỉnh sửa thiết kế</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tên thiết kế</label>
                <input
                  type="text"
                  value={editData.name || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Mô tả</label>
                <textarea
                  value={editData.description || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Loại sản phẩm</label>
                  <select
                    value={editData.type || template.type}
                    onChange={(e) => setEditData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Danh mục</label>
                  <input
                    type="text"
                    value={editData.category || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tags</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-3 py-2 border rounded-lg"
                    placeholder="Nhập tag và nhấn Enter"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Thêm
                  </button>
                </div>
                {(editData.tags || template.tags).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(editData.tags || template.tags).map((tag, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full flex items-center gap-2">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-blue-800">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Ghi chú</label>
                <textarea
                  value={editData.notes || ''}
                  onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editData.isPublic ?? template.isPublic}
                    onChange={(e) => setEditData(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Công khai</span>
                </label>
              </div>
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleUpdate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
