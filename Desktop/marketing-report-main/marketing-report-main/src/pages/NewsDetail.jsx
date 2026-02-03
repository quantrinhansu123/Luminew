import { ArrowLeft, Calendar, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const NewsDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [newsItem, setNewsItem] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchNewsDetail = async () => {
            try {
                const { data, error } = await supabase
                    .from('news')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;
                setNewsItem(data);
            } catch (error) {
                console.error('Error fetching news:', error);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchNewsDetail();
        }
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            </div>
        );
    }

    if (!newsItem) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
                <h2 className="text-xl font-bold text-gray-700">Không tìm thấy bài viết</h2>
                <button
                    onClick={() => navigate('/trang-chu')}
                    className="flex items-center gap-2 text-red-600 hover:underline"
                >
                    <ArrowLeft size={20} /> Quay lại trang chủ
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

                {/* Big Image Cover */}
                <div className="w-full h-80 bg-gray-100 flex items-center justify-center overflow-hidden relative">
                    {newsItem.image_url ? (
                        <img
                            src={newsItem.image_url}
                            alt={newsItem.title}
                            className="w-full h-full object-contain p-4"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400">
                            <Megaphone size={48} className="mb-2 opacity-50" />
                            <span>Không có ảnh</span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">{newsItem.title}</h1>

                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-8 pb-4 border-b border-gray-100">
                        <Calendar size={16} />
                        <span>Đăng ngày: {new Date(newsItem.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>

                    <div className="prose max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {newsItem.content}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewsDetail;
