import { ArrowLeft, Calendar, Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const NewsDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [newsItem, setNewsItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [relatedNews, setRelatedNews] = useState([]);
    const [showCookieBanner, setShowCookieBanner] = useState(true);

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

                // Fetch related news (exclude current news)
                const { data: related, error: relatedError } = await supabase
                    .from('news')
                    .select('*')
                    .neq('id', id)
                    .order('created_at', { ascending: false })
                    .limit(3);

                if (!relatedError && related) {
                    setRelatedNews(related);
                }
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

    // Check if cookie consent was already accepted
    useEffect(() => {
        const cookieConsent = localStorage.getItem('cookieConsent');
        if (cookieConsent === 'accepted') {
            setShowCookieBanner(false);
        }
    }, []);

    const handleAcceptCookies = () => {
        localStorage.setItem('cookieConsent', 'accepted');
        setShowCookieBanner(false);
    };

    const handleRejectCookies = () => {
        localStorage.setItem('cookieConsent', 'rejected');
        setShowCookieBanner(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2d7c2d]"></div>
            </div>
        );
    }

    if (!newsItem) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
                <h2 className="text-xl font-bold text-gray-700">Không tìm thấy bài viết</h2>
                <button
                    onClick={() => navigate('/trang-chu')}
                    className="flex items-center gap-2 text-[#2d7c2d] hover:underline"
                >
                    <ArrowLeft size={20} /> Quay lại trang chủ
                </button>
            </div>
        );
    }

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    return (
        <div className="min-h-screen bg-white">

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Section - Main Article */}
                    <div className="lg:col-span-2">
                        <div className="mb-6">
                            <h1 className="text-4xl font-bold text-white bg-[#2d7c2d] px-6 py-4 mb-2">
                                ĐIỂM TIN
                            </h1>
                            <p className="text-gray-600 text-sm mb-6">
                                Cập nhật thông tin nổi bật nhất từ LumiGlobal
                            </p>
                        </div>

                        {/* Main Image */}
                        <div className="w-full mb-6 bg-gray-100 rounded-lg overflow-hidden">
                            {newsItem.image_url ? (
                                <img
                                    src={newsItem.image_url}
                                    alt={newsItem.title}
                                    className="w-full h-auto object-cover"
                                />
                            ) : (
                                <div className="w-full h-96 flex flex-col items-center justify-center text-gray-400 bg-gray-100">
                                    <Megaphone size={64} className="mb-4 opacity-50" />
                                    <span>Không có ảnh</span>
                                </div>
                            )}
                        </div>

                        {/* Article Title */}
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">
                            {newsItem.title}
                        </h2>

                        {/* Date and Category */}
                        <div className="flex items-center gap-4 text-gray-600 text-sm mb-6 pb-4 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} />
                                <span>{formatDate(newsItem.created_at)}</span>
                            </div>
                            {newsItem.category && (
                                <span className="px-3 py-1 bg-gray-100 rounded-full text-xs">
                                    {newsItem.category}
                                </span>
                            )}
                        </div>

                        {/* Article Content */}
                        <div className="prose max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap text-base">
                            {newsItem.content}
                        </div>
                    </div>

                    {/* Right Section - Related News */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24">
                            <h3 className="text-2xl font-bold text-white bg-[#2d7c2d] px-4 py-3 mb-4 text-center">
                                Nổi bật từ LumiGlobal
                            </h3>

                            <div className="space-y-6">
                                {relatedNews.length > 0 ? (
                                    relatedNews.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                                            onClick={() => navigate(`/news/${item.id}`)}
                                        >
                                            {item.image_url && (
                                                <div className="w-full h-40 bg-gray-100 overflow-hidden">
                                                    <img
                                                        src={item.image_url}
                                                        alt={item.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}
                                            <div className="p-4">
                                                <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2 hover:text-[#2d7c2d] transition-colors">
                                                    {item.title}
                                                </h4>
                                                <div className="flex items-center justify-between text-xs text-gray-500">
                                                    <span>{formatDate(item.created_at)}</span>
                                                    {item.category && (
                                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                                                            {item.category}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-gray-500 py-8">
                                        Chưa có bài viết liên quan
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cookie Consent Banner */}
            {showCookieBanner && (
                <div className="fixed bottom-0 left-0 right-0 bg-[#2d7c2d] text-white p-4 shadow-lg z-50">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                        <p className="text-sm text-center md:text-left">
                            We use cookies on our website to give you the most relevant experience by remembering your preferences and repeat visits.
                            By clicking "Accept", you consent to the use of ALL the cookies.
                            You may visit Cookie settings to manage which cookies are used.
                            <a href="#" className="underline ml-1">Cookie Policy</a>
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleAcceptCookies}
                                className="px-6 py-2 bg-white text-[#2d7c2d] border-2 border-white rounded-md font-semibold hover:bg-gray-100 transition-colors"
                            >
                                ACCEPT
                            </button>
                            <button
                                onClick={handleRejectCookies}
                                className="px-6 py-2 bg-transparent text-white border-2 border-white rounded-md font-semibold hover:bg-white hover:text-[#2d7c2d] transition-colors"
                            >
                                REJECT
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewsDetail;
