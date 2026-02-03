import bcrypt from 'bcryptjs';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from '../supabase/config';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Query Supabase users table
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (userError && userError.code !== 'PGRST116') { // PGRST116 is specific for 0 rows in .single()
        throw userError;
      }

      if (user) {
        const userData = user;
        const userId = user.id;

        // Kiểm tra xem user có mật khẩu không
        if (!userData.password) {
          toast.error('Tài khoản chưa được thiết lập mật khẩu. Vui lòng liên hệ quản trị viên!', {
            position: "top-right",
            autoClose: 5000,
          });
          setLoading(false);
          return;
        }

        // So sánh mật khẩu đã hash
        const passwordMatch = bcrypt.compareSync(password, userData.password);

        if (passwordMatch) {
          // Lưu thông tin đăng nhập vào localStorage
          localStorage.setItem('isAuthenticated', 'true');
          localStorage.setItem('userId', userId);
          // Prefer 'name' from Supabase, fallback to username
          localStorage.setItem('username', userData.name || userData.username || 'User');

          // Force admin role for admin@marketing.com or use DB role
          const userEmail = userData.email || '';
          const userRole = userEmail === 'admin@marketing.com' ? 'admin' : (userData.role || 'user');
          localStorage.setItem('userRole', userRole);

          localStorage.setItem('userEmail', userEmail);
          // Supabase 'users' table has 'team' column based on UserManagementTab
          localStorage.setItem('userTeam', userData.team || '');

          toast.success('Đăng nhập thành công!', {
            position: "top-right",
            autoClose: 2000,
          });

          // Chuyển đến trang chính sau 2 giây
          setTimeout(() => {
            navigate('/trang-chu');
          }, 2000);
        } else {
          toast.error('Email hoặc mật khẩu không đúng!', {
            position: "top-right",
            autoClose: 4000,
          });
        }
      } else {
        toast.error('Email hoặc mật khẩu không đúng!', {
          position: "top-right",
          autoClose: 4000,
        });
      }
    } catch (err) {
      console.error('Login error:', err);
      toast.error('Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại!', {
        position: "top-right",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-secondary flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
              alt="Logo"
              className="h-20 w-20 rounded-full shadow-lg"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            BÁO CÁO MARKETING
          </h1>
          <p className="text-green-100">Đăng nhập để tiếp tục</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <form onSubmit={handleLogin}>
            {/* Email */}
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="Nhập email"
                required
                disabled={loading}
              />
            </div>

            {/* Password */}
            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Mật khẩu
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition"
                placeholder="Nhập mật khẩu"
                required
                disabled={loading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition ${loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-primary hover:bg-green-700 active:bg-green-800'
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang đăng nhập...
                </span>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-white text-sm">
          <p>&copy; 2025 Báo cáo Marketing. All rights reserved.</p>
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={true}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
    </div>
  );
}

export default Login;
