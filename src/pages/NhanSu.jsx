import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Plus, Edit, Trash2, Eye, Calendar, User, Image as ImageIcon, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'react-toastify';

export default function NhanSu() {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("user");
  const [userEmail, setUserEmail] = useState("");
  const [newsList, setNewsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNews, setEditingNews] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [newNews, setNewNews] = useState({
    title: '',
    content: '',
    type: 'normal',
    image_url: ''
  });

  useEffect(() => {
    setUserRole(localStorage.getItem("userRole") || "user");
    setUserEmail(localStorage.getItem("userEmail") || "");
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNewsList(data || []);
    } catch (error) {
      console.error('Error fetching news:', error);
      toast.error('Lỗi khi tải danh sách tin tức');
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = async (file) => {
    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `news-images/${fileName}`;

      const { data, error } = await supabase.storage
        .from('news-images')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('news-images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  };

  const handleAddNews = async () => {
    if (!newNews.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề');
      return;
    }

    try {
      let finalImageUrl = newNews.image_url;

      if (imageFile) {
        finalImageUrl = await handleImageUpload(imageFile);
      }

      const { error } = await supabase.from('news').insert([{
        ...newNews,
        image_url: finalImageUrl,
        created_by: userEmail
      }]);

      if (error) throw error;

      toast.success('Thêm tin tức thành công!');
      setShowAddModal(false);
      setNewNews({ title: '', content: '', type: 'normal', image_url: '' });
      setImageFile(null);
      setImagePreview(null);
      fetchNews();
    } catch (error) {
      console.error('Error adding news:', error);
      toast.error('Lỗi khi thêm tin tức: ' + error.message);
    }
  };

  const handleEditNews = async () => {
    if (!editingNews || !editingNews.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề');
      return;
    }

    try {
      let finalImageUrl = editingNews.image_url;

      if (imageFile) {
        finalImageUrl = await handleImageUpload(imageFile);
      }

      const { error } = await supabase
        .from('news')
        .update({
          title: editingNews.title,
          content: editingNews.content,
          type: editingNews.type,
          image_url: finalImageUrl
        })
        .eq('id', editingNews.id);

      if (error) throw error;

      toast.success('Cập nhật tin tức thành công!');
      setShowEditModal(false);
      setEditingNews(null);
      setImageFile(null);
      setImagePreview(null);
      fetchNews();
    } catch (error) {
      console.error('Error updating news:', error);
      toast.error('Lỗi khi cập nhật tin tức: ' + error.message);
    }
  };

  const handleDeleteNews = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tin tức này?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('news')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Xóa tin tức thành công!');
      fetchNews();
    } catch (error) {
      console.error('Error deleting news:', error);
      toast.error('Lỗi khi xóa tin tức: ' + error.message);
    }
  };

  const openEditModal = (news) => {
    setEditingNews({ ...news });
    setImageFile(null);
    setImagePreview(news.image_url || null);
    setShowEditModal(true);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="mx-auto px-8 py-8 bg-gray-50 min-h-screen">
      <div className="mb-6">
        <Link to="/" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-2">
          <ChevronLeft className="w-4 h-4" />
          Quay lại
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800 mt-2">Tin tức nội bộ</h1>
          <button
            onClick={() => {
              setNewNews({ title: '', content: '', type: 'normal', image_url: '' });
              setImageFile(null);
              setImagePreview(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#2d7c2d] text-white rounded-md hover:bg-[#256725] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm mới
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2d7c2d]"></div>
        </div>
      ) : newsList.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">Chưa có tin tức nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {newsList.map((news) => (
            <div key={news.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              {news.image_url && (
                <div className="h-48 bg-gray-200 overflow-hidden">
                  <img
                    src={news.image_url}
                    alt={news.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-800 line-clamp-2">{news.title}</h3>
                  {news.type === 'featured' && (
                    <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">Nổi bật</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 line-clamp-3 mb-3">{news.content}</p>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(news.created_at)}</span>
                  </div>
                  {news.created_by && (
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{news.created_by}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/news/${news.id}`)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Xem
                  </button>
                  <button
                    onClick={() => openEditModal(news)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDeleteNews(news.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add News Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Thêm tin tức mới</h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewNews({ title: '', content: '', type: 'normal', image_url: '' });
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tiêu đề <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newNews.title}
                  onChange={(e) => setNewNews({ ...newNews, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                  placeholder="Nhập tiêu đề tin tức"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nội dung
                </label>
                <textarea
                  value={newNews.content}
                  onChange={(e) => setNewNews({ ...newNews, content: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                  placeholder="Nhập nội dung tin tức"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loại tin tức
                </label>
                <select
                  value={newNews.type}
                  onChange={(e) => setNewNews({ ...newNews, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                >
                  <option value="normal">Bình thường</option>
                  <option value="featured">Nổi bật</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hình ảnh
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <img src={imagePreview} alt="Preview" className="max-w-full h-48 object-cover rounded-md" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewNews({ title: '', content: '', type: 'normal', image_url: '' });
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleAddNews}
                className="px-4 py-2 bg-[#2d7c2d] text-white rounded-md hover:bg-[#256725] transition-colors"
              >
                Thêm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit News Modal */}
      {showEditModal && editingNews && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800">Sửa tin tức</h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingNews(null);
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tiêu đề <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingNews.title}
                  onChange={(e) => setEditingNews({ ...editingNews, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                  placeholder="Nhập tiêu đề tin tức"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nội dung
                </label>
                <textarea
                  value={editingNews.content}
                  onChange={(e) => setEditingNews({ ...editingNews, content: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                  placeholder="Nhập nội dung tin tức"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loại tin tức
                </label>
                <select
                  value={editingNews.type}
                  onChange={(e) => setEditingNews({ ...editingNews, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                >
                  <option value="normal">Bình thường</option>
                  <option value="featured">Nổi bật</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Hình ảnh
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <img src={imagePreview} alt="Preview" className="max-w-full h-48 object-cover rounded-md" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingNews(null);
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleEditNews}
                className="px-4 py-2 bg-[#2d7c2d] text-white rounded-md hover:bg-[#256725] transition-colors"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
