import React, { useState } from "react";

const TeacherOnboarding = () => {
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      setError("Vui lòng nhập họ và tên");
      return;
    }

    try {
      setError("");
      setLoading(true);
      // await onSubmit(fullName.trim());
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-6">
          {/* Logo */}
          <img
            src="/img/logo.png"
            alt="Trí Tuệ 8+ Logo"
            className="mx-auto mb-4 w-36 h-36"
          />
          <h2 className="text-xl sm:text-2xl font-bold text-[#36797f] mb-2">
            Chào mừng giáo viên!
          </h2>
          <p className="text-sm sm:text-base text-gray-600">
            Vui lòng cung cấp thông tin của bạn
          </p>
        </div>

        {/* Email Info */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
          <p className="text-xs sm:text-sm text-gray-600 mb-1">
            Email đăng nhập:
          </p>
          <p className="text-sm sm:text-base font-semibold text-gray-800 break-all">
            {/* {userEmail} */}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-xs sm:text-sm">
              {error}
            </div>
          )}

          <div className="mb-4 sm:mb-6">
            <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-2">
              Họ và tên <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nhập họ và tên đầy đủ"
              className="w-full p-2.5 sm:p-3 text-sm sm:text-base border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-[#36797f] focus:border-[#36797f] outline-none"
              disabled={loading}
              autoFocus
            />
            <p className="mt-1.5 sm:mt-2 text-xs text-gray-500">
              Thông tin này sẽ được lưu vào hệ thống giáo viên
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !fullName.trim()}
            className="w-full bg-gradient-to-r from-[#36797f] to-[#36797f] text-white font-bold py-2.5 sm:py-3 px-4 sm:px-6 text-sm sm:text-base rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 sm:h-5 sm:w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Đang xử lý...
              </span>
            ) : (
              "Hoàn tất"
            )}
          </button>
        </form>

        {/* Info Note */}
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <span className="font-semibold">Lưu ý:</span> Sau khi hoàn tất, bạn
            sẽ có quyền truy cập vào hệ thống quản lý lịch học và học sinh của
            mình.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeacherOnboarding;
