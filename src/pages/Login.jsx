import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from '../supabase/config';
import bcrypt from 'bcryptjs';

function Login() {
  console.log('🔐 Login component rendering...');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(false);
  const navigate = useNavigate();
  
  console.log('Supabase config:', { 
    url: import.meta.env.VITE_SUPABASE_URL ? 'Set' : 'Missing', 
    key: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing' 
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    console.log('🔐 Attempting login with email:', email);

    try {
      // Query Supabase users table
      console.log('📡 Querying users table...');
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      console.log('📡 Query result:', { user: user ? 'Found' : 'Not found', error: userError });

      if (userError) {
        console.error('❌ Supabase error:', userError);
        // PGRST116 is specific for 0 rows in .single()
        if (userError.code === 'PGRST116') {
          console.log('⚠️ User not found with email:', email);
          toast.error('Email hoặc mật khẩu không đúng!', {
            position: "top-right",
            autoClose: 4000,
          });
          setLoading(false);
          return;
        }
        // Other errors
        throw userError;
      }

      if (user) {
        const userData = user;
        const userId = user.id;
        console.log('✅ User found:', { id: userId, email: userData.email, hasPassword: !!userData.password });

        // Kiểm tra xem user có mật khẩu không
        if (!userData.password) {
          console.log('⚠️ User has no password set');
          toast.error('Tài khoản chưa được thiết lập mật khẩu. Vui lòng liên hệ quản trị viên!', {
            position: "top-right",
            autoClose: 5000,
          });
          setLoading(false);
          return;
        }

        // So sánh mật khẩu đã hash
        console.log('🔒 Comparing password...');
        const passwordMatch = bcrypt.compareSync(password, userData.password);
        console.log('🔒 Password match:', passwordMatch);

        if (passwordMatch) {
          console.log('✅ Login successful!');
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

          // Hiển thị intro logo animation
          setShowIntro(true);
          
          // Chuyển đến trang chính sau 3 giây (sau khi intro animation)
          setTimeout(() => {
            navigate('/trang-chu');
          }, 3000);
        } else {
          console.log('❌ Password mismatch');
          toast.error('Email hoặc mật khẩu không đúng!', {
            position: "top-right",
            autoClose: 4000,
          });
        }
      } else {
        console.log('⚠️ No user data returned');
        toast.error('Email hoặc mật khẩu không đúng!', {
          position: "top-right",
          autoClose: 4000,
        });
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint
      });
      toast.error(`Đã xảy ra lỗi khi đăng nhập: ${err.message || 'Vui lòng thử lại!'}`, {
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
            Hệ thống vận hành Lumi
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
          <p>&copy; 2025 Hệ thống vận hành Lumi. All rights reserved.</p>
        </div>
      </div>

      {/* Intro Logo Animation */}
      {showIntro && (
        <div className="fixed inset-0 bg-gradient-to-br from-primary to-secondary flex items-center justify-center z-50" style={{
          animation: 'fadeIn 0.3s ease-in',
        }}>
          <style>{`
            @keyframes logoIntro {
              0% {
                transform: scale(0) rotate(0deg);
                opacity: 0;
              }
              50% {
                transform: scale(1.2) rotate(180deg);
                opacity: 1;
              }
              100% {
                transform: scale(1) rotate(360deg);
                opacity: 1;
              }
            }
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            @keyframes fadeIn {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }
            .logo-intro {
              animation: logoIntro 1.5s ease-out;
            }
            .fade-in-up-delay-1 {
              animation: fadeInUp 1s ease-out 0.5s both;
            }
            .fade-in-up-delay-2 {
              animation: fadeInUp 1s ease-out 1s both;
            }
          `}</style>
          <div className="text-center">
            <div className="mb-6">
              <img
                src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
                alt="Logo"
                className="h-32 w-32 rounded-full shadow-2xl mx-auto logo-intro"
              />
            </div>
            <h2 className="text-4xl font-bold text-white mb-2 fade-in-up-delay-1">
              Hệ thống vận hành Lumi
            </h2>
            <p className="text-green-100 text-lg fade-in-up-delay-2">
              Chào mừng bạn trở lại!
            </p>
          </div>
        </div>
      )}

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
