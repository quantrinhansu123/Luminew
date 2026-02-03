import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPersonnel } from '../services/dataService';

export const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const personnel = await fetchPersonnel();

            // Tìm user trong Personnel
            const user = personnel.find(p => p.email?.toLowerCase() === email.trim().toLowerCase());

            if (user) {
                // Check password (simple verification for this demo)
                if (user.password === password) {
                    localStorage.setItem('currentUser', user.fullName);
                    localStorage.setItem('currentUserId', user.id || '');
                    // Map role: 'admin' -> 'admin', 'partner' -> 'partner', còn lại -> 'employee'
                    let roleToStore: string;
                    if (user.role === 'admin') {
                        roleToStore = 'admin';
                    } else if (user.role === 'partner') {
                        roleToStore = 'partner';
                    } else {
                        roleToStore = 'employee';
                    }
                    localStorage.setItem('currentUserRole', roleToStore);
                    localStorage.setItem('currentUserDepartment', user.department || '');
                    localStorage.setItem('currentUserPosition', user.position || '');
                    navigate('/');
                    window.location.reload();
                    return;
                } else {
                    setError('Mật khẩu không đúng! (密码不正确!)');
                }
            } else {
                setError('Email không tồn tại trong hệ thống! (系统中不存在此邮箱!)');
            }
        } catch (err) {
            setError('Lỗi kết nối, vui lòng thử lại. (连接错误，请重试。)');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded shadow-md w-full max-w-sm">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6 uppercase">Đăng nhập hệ thống (系统登录)</h2>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                            Email đăng nhập (登录邮箱)
                        </label>
                        <input
                            type="email"
                            id="email"
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                            placeholder="email@phonglive.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                            Mật khẩu (密码)
                        </label>
                        <input
                            type="password"
                            id="password"
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-brand-navy focus:ring-1 focus:ring-brand-navy"
                            placeholder="••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full bg-brand-navy text-white font-bold py-2 px-4 rounded hover:bg-brand-darkNavy transition duration-200 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Đang kiểm tra... (检查中...)' : 'Vào hệ thống (进入系统)'}
                    </button>
                </form>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-sm font-bold text-blue-900 mb-2">Gợi ý đăng nhập (登录提示):</h3>
                    <ul className="text-xs text-blue-800 space-y-1">
                        <li>• Sử dụng Email và Mật khẩu đã được tạo trong phần "Nhân sự" (使用在"人事"部分创建的邮箱和密码)</li>
                        <li>• Nếu chưa có tài khoản, vui lòng liên hệ Admin để được tạo tài khoản (如果没有账户，请联系管理员创建账户)</li>
                        <li>• Email đăng nhập là Email được nhập trong thông tin nhân sự (登录邮箱是在人员信息中输入的邮箱)</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};
