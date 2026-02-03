'use client';

import { useCallback, useEffect, useState } from 'react';
import { DesignTemplate, UploadedFile } from '@/types/design';
import {
  Image,
  Search,
  Plus,
  Filter,
  Eye,
  Trash2,
  Download,
  Copy,
  FileImage,
  Upload,
  X
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const PRODUCT_TYPES = ['bag', 'box', 'card', 'label', 'other'];
const TYPE_LABELS: Record<string, string> = {
  bag: 'Túi',
  box: 'Hộp',
  card: 'Thiệp',
  label: 'Nhãn',
  other: 'Khác'
};

export default function DesignLibrary() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({
    name: '',
    description: '',
    type: 'bag',
    category: '',
    tags: [] as string[],
    notes: '',
    isPublic: false
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
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

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      let query = supabase
        .from('design_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (typeFilter) query = query.eq('type', typeFilter);
      if (categoryFilter) query = query.ilike('category', `%${categoryFilter}%`);
      if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

      const { data, error: err } = await query;
      if (err) throw err;
      setTemplates((data || []).map(mapTemplateFromDb));
    } catch (err: any) {
      console.error('Error fetching design templates:', err);
      setError(err?.message || 'Lỗi khi tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter, categoryFilter, search]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const addTag = () => {
    if (tagInput.trim() && !uploadData.tags.includes(tagInput.trim())) {
      setUploadData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setUploadData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleCreate = async () => {
    try {
      // 1) Create template row
      const { data: createdRow, error: createErr } = await supabase
        .from('design_templates')
        .insert([
          {
            name: uploadData.name,
            description: uploadData.description || null,
            type: uploadData.type,
            category: uploadData.category || null,
            tags: uploadData.tags,
            notes: uploadData.notes || null,
            is_public: uploadData.isPublic,
            usage_count: 0,
          },
        ])
        .select('*')
        .single();

      if (createErr) throw createErr;

      // 2) Upload files to Supabase Storage (optional)
      let uploadedFiles: UploadedFile[] = [];
      let thumbnailUrl: string | undefined;

      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          const storagePath = `design-templates/${createdRow.id}/${Date.now()}-${file.name}`;
          const { error: uploadErr } = await supabase.storage
            .from('design-files')
            .upload(storagePath, file, { upsert: true });
          if (uploadErr) throw uploadErr;

          const { data: publicUrlData } = supabase.storage.from('design-files').getPublicUrl(storagePath);
          const url = publicUrlData.publicUrl;

          const meta: UploadedFile = {
            url,
            fileName: storagePath,
            originalName: file.name,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          };
          uploadedFiles.push(meta);

          if (!thumbnailUrl && file.type.startsWith('image/')) {
            thumbnailUrl = url;
          }
        }

        // 3) Update DB row with file_urls + thumbnail_url
        const { error: updateErr } = await supabase
          .from('design_templates')
          .update({
            file_urls: uploadedFiles,
            thumbnail_url: thumbnailUrl || null,
          })
          .eq('id', createdRow.id);

        if (updateErr) throw updateErr;
      }

      toast.success('Đã tạo thiết kế!');
      await fetchTemplates();

      // Reset form
      setShowUploadModal(false);
      setUploadData({
        name: '',
        description: '',
        type: 'bag',
        category: '',
        tags: [],
        notes: '',
        isPublic: false
      });
      setSelectedFiles([]);
    } catch (err) {
      console.error('Error creating template:', err);
      toast.error('Có lỗi xảy ra khi tạo thiết kế.');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bạn có chắc muốn xóa thiết kế này?')) {
      const { error: err } = await supabase.from('design_templates').delete().eq('id', id);
      if (err) {
        toast.error(err.message || 'Xóa thất bại');
        return;
      }
      toast.success('Đã xóa thiết kế');
      await fetchTemplates();
    }
  };

  const handleViewDetail = (id: string) => {
    router.push(`/design-library/${id}`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kho Thiết Kế</h1>
          <p className="text-gray-500 text-sm">Quản lý thư viện mẫu thiết kế</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Thêm Thiết Kế
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm thiết kế..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="">Tất cả loại sản phẩm</option>
            {PRODUCT_TYPES.map(type => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Danh mục..."
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">Lỗi: {error}</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileImage className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>Chưa có thiết kế nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer group"
              onClick={() => handleViewDetail(template.id)}
            >
              <div className="aspect-square bg-gray-100 rounded-t-lg overflow-hidden relative">
                {template.thumbnailUrl ? (
                  <img
                    src={template.thumbnailUrl}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileImage className="w-12 h-12 text-gray-300" />
                  </div>
                )}

                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewDetail(template.id);
                    }}
                    className="p-2 bg-white rounded-full hover:bg-gray-100"
                    title="Xem chi tiết"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(template.id);
                    }}
                    className="p-2 bg-white rounded-full hover:bg-gray-100"
                    title="Xóa"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>

              <div className="p-3">
                <h3 className="font-medium text-sm truncate" title={template.name}>
                  {template.name}
                </h3>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">{TYPE_LABELS[template.type]}</span>
                  <span className="text-xs text-gray-400">
                    {template.usageCount} lần sử dụng
                  </span>
                </div>
                {template.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.tags.slice(0, 2).map((tag, i) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded">
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 2 && (
                      <span className="px-2 py-0.5 bg-gray-50 text-gray-600 text-xs rounded">
                        +{template.tags.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold">Thêm Thiết Kế Mới</h2>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tên thiết kế *</label>
                <input
                  type="text"
                  value={uploadData.name}
                  onChange={(e) => setUploadData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Mô tả</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Loại sản phẩm *</label>
                  <select
                    value={uploadData.type}
                    onChange={(e) => setUploadData(prev => ({ ...prev, type: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {PRODUCT_TYPES.map(type => (
                      <option key={type} value={type}>{TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Danh mục</label>
                  <input
                    type="text"
                    value={uploadData.category}
                    onChange={(e) => setUploadData(prev => ({ ...prev, category: e.target.value }))}
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
                {uploadData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {uploadData.tags.map((tag, i) => (
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
                  value={uploadData.notes}
                  onChange={(e) => setUploadData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg"
                  rows={2}
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={uploadData.isPublic}
                    onChange={(e) => setUploadData(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Công khai (có thể chia sẻ)</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Upload Files</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.ai,.psd"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-8 h-8 text-gray-400" />
                    <span className="text-sm text-gray-600">Click để chọn file hoặc kéo thả vào đây</span>
                    <span className="text-xs text-gray-400">Hỗ trợ: Images, PDF, AI, PSD</span>
                  </label>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm truncate flex-1">{file.name}</span>
                        <button
                          onClick={() => removeSelectedFile(i)}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleCreate}
                disabled={!uploadData.name}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tạo Thiết Kế
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
