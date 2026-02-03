import React, { useState } from 'react';
import { seedDatabase } from '../utils/seedDatabaseBrowser';

/**
 * Component để thêm dữ liệu vào Supabase
 * Có thể thêm vào App hoặc sử dụng độc lập
 */
export const SupabaseSeeder: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSeed = async (clearExisting: boolean = false) => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const result = await seedDatabase(clearExisting);
      
      if (result.success) {
        setMessage(result.message || 'Đã thêm dữ liệu thành công!');
      } else {
        setError(result.message || 'Có lỗi xảy ra');
      }
    } catch (err) {
      setError('Lỗi không mong đợi: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-md max-w-md mx-auto mt-4">
      <h3 className="text-lg font-semibold mb-4">Thêm dữ liệu vào Supabase</h3>
      
      <div className="space-y-3">
        <button
          onClick={() => handleSeed(false)}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang thêm dữ liệu...' : 'Thêm dữ liệu mới'}
        </button>
        
        <button
          onClick={() => handleSeed(true)}
          disabled={loading}
          className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Đang xóa và thêm lại...' : 'Xóa dữ liệu cũ và thêm mới'}
        </button>
      </div>

      {message && (
        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  );
};
