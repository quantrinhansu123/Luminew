import React, { useState, useEffect } from 'react';
import { MOCK_STORES, fetchStores } from '../services/dataService';
import { VideoMetric } from '../types';
import { isPartner, getPartnerId, isAdmin } from '../utils/permissionUtils';

interface VideoEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: VideoMetric) => Promise<void>;
  initialData?: VideoMetric;
}

export const VideoEditModal: React.FC<VideoEditModalProps> = ({ isOpen, onClose, onSubmit, initialData }) => {
  const [stores, setStores] = useState(MOCK_STORES);
  const defaultFormData: VideoMetric = {
    id: '',
    title: '',
    storeId: MOCK_STORES.find(s => s.id !== 'all')?.id || '',
    platform: 'TikTok',
    uploadDate: new Date().toISOString().split('T')[0],
    views: 0,
    personInCharge: '',
    sales: 0
  };

  const [formData, setFormData] = useState<VideoMetric>(defaultFormData);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      fetchStores().then(data => {
        // Nếu là nhân viên có department "Đối tác", chỉ hiển thị stores được gán cho họ
        let filteredStores = data;
        if (isPartner() && !isAdmin()) {
          const partnerId = getPartnerId();
          if (partnerId) {
            filteredStores = data.filter(s => s.partnerId === partnerId);
          }
        }
        setStores(filteredStores.length > 0 ? filteredStores : MOCK_STORES);
      }).catch(() => {
        setStores(MOCK_STORES);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData(initialData);
      } else {
        setFormData(defaultFormData);
      }
    }
  }, [isOpen, initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? 0 : Number(value)) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      alert("Lỗi khi lưu video");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <h2 className="text-xl font-bold text-gray-800 mb-6 uppercase border-b pb-2">
          {initialData ? 'Sửa Video (编辑视频)' : 'Thêm Video (添加视频)'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên Video (视频名称) *</label>
              <input 
                required 
                type="text" 
                name="title" 
                value={formData.title} 
                onChange={handleChange} 
                className="w-full border rounded px-3 py-2 focus:ring-brand-navy focus:border-brand-navy" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cửa hàng (门店) *</label>
              <select 
                name="storeId" 
                value={formData.storeId} 
                onChange={handleChange} 
                className="w-full border rounded px-3 py-2 bg-white"
                required
              >
                {stores.filter(s => s.id !== 'all').map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nền tảng (平台)</label>
              <select 
                name="platform" 
                value={formData.platform} 
                onChange={handleChange} 
                className="w-full border rounded px-3 py-2 bg-white"
              >
                <option value="TikTok">TikTok</option>
                <option value="Facebook">Facebook</option>
                <option value="Shopee">Shopee</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày đăng (发布时间) *</label>
              <input 
                required 
                type="date" 
                name="uploadDate" 
                value={formData.uploadDate} 
                onChange={handleChange} 
                className="w-full border rounded px-3 py-2" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ trách (负责人)</label>
              <input 
                type="text" 
                name="personInCharge" 
                value={formData.personInCharge} 
                onChange={handleChange} 
                className="w-full border rounded px-3 py-2" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lượt xem (观看人次) *</label>
              <input 
                required 
                type="number" 
                name="views" 
                value={formData.views} 
                onChange={handleChange} 
                min="0" 
                className="w-full border rounded px-3 py-2" 
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GMV (销售额) *</label>
              <input 
                required 
                type="number" 
                name="sales" 
                value={formData.sales} 
                onChange={handleChange} 
                min="0" 
                className="w-full border rounded px-3 py-2 font-bold text-green-600" 
              />
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-6 py-2 border rounded text-gray-600 hover:bg-gray-50"
            >
              Hủy (取消)
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-2 bg-brand-navy text-white rounded font-bold hover:bg-brand-darkNavy disabled:opacity-50"
            >
              {loading ? 'Đang lưu... (保存中...)' : 'Lưu (保存)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

