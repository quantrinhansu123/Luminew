import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Camera, ChevronLeft, LogIn, LogOut, CheckCircle, RefreshCcw } from "lucide-react";
import { supabase } from "../supabase/config";
import { toast } from "react-toastify";

// Helper function: Trả về chuỗi ngày YYYY-MM-DD
function getTodayDateStr() {
  const d = new Date();
  d.setHours(d.getHours() + 7); // Giả định múi giờ VN GMT+7 để lấy đúng ngày
  return d.toISOString().split("T")[0];
}

export default function ChamCong() {
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState(null);
  
  // Camera state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);

  // Khởi tạo
  useEffect(() => {
    const email = localStorage.getItem("userEmail") || "";
    if (email) {
      setUserEmail(email);
      fetchTodayRecord(email);
    } else {
      setLoading(false);
      setCameraError("Không tìm thấy email người dùng. Vui lòng đăng nhập lại.");
    }
    
    // Khởi động camera
    startCamera();

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setCameraError("");
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" }, // Ưu tiên camera trước trên điện thoại
        audio: false 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Lỗi truy cập camera:", err);
      setCameraError("Không thể truy cập Camera. Vui lòng cấp quyền trong trình duyệt.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Lấy dữ liệu chấm công hôm nay
  const fetchTodayRecord = async (email) => {
    setLoading(true);
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_email', email)
        .gte('check_in_time', todayStart.toISOString())
        .lte('check_in_time', todayEnd.toISOString())
        .order('check_in_time', { ascending: false })
        .limit(1);

      if (error) {
        // Có thể bảng chưa được tạo, log lỗi
        console.warn("Lỗi fetch attendance_logs (có thể chưa tạo bảng):", error.message);
      } else if (data && data.length > 0) {
        setTodayRecord(data[0]);
      }
    } catch (err) {
      console.error("Fetch record error:", err);
    } finally {
      setLoading(false);
    }
  };

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Vẽ frame từ video sang canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Chuyển canvas thành chuỗi base64 jpeg
      return canvas.toDataURL("image/jpeg", 0.8);
    }
    return null;
  }, []);

  const uploadPhotoToCloudinary = async (base64Image) => {
    // API backend mà chúng ta vừa tạo trong server.js
    const PORT = import.meta.env.VITE_API_PORT || 3002;
    // Sử dụng đường dẫn tương đối (hoặc cấu hình url linh hoạt theo môi trường)
    // Nếu app chạy Vercel thì gọi API thông qua proxy hoặc server URL tương ứng
    // Ở đây ta gọi thẳng vào backend nodejs
    const apiUrl = import.meta.env.DEV 
      ? `http://localhost:${PORT}/api/upload-cloudinary` 
      : `/api/upload-cloudinary`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image }),
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || "Upload thất bại");
    }
    return result.secure_url;
  };

  const handleCheckIn = async () => {
    const photoBase64 = capturePhoto();
    if (!photoBase64) {
      toast.error("Không thể chụp ảnh, vui lòng thử lại.");
      return;
    }

    setIsProcessing(true);
    setPhotoPreview(photoBase64);
    
    try {
      const photoUrl = await uploadPhotoToCloudinary(photoBase64);
      
      const { data, error } = await supabase
        .from('attendance_logs')
        .insert([{
          user_email: userEmail,
          check_in_time: new Date().toISOString(),
          check_in_photo: photoUrl
        }])
        .select();

      if (error) throw error;

      toast.success("Check-in thành công!");
      setTodayRecord(data[0]);
    } catch (err) {
      console.error(err);
      toast.error(`Check-in thất bại: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setPhotoPreview(null), 3000);
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord || !todayRecord.id) return;

    const photoBase64 = capturePhoto();
    if (!photoBase64) {
      toast.error("Không thể chụp ảnh, vui lòng thử lại.");
      return;
    }

    setIsProcessing(true);
    setPhotoPreview(photoBase64);

    try {
      const photoUrl = await uploadPhotoToCloudinary(photoBase64);
      
      const { data, error } = await supabase
        .from('attendance_logs')
        .update({
          check_out_time: new Date().toISOString(),
          check_out_photo: photoUrl
        })
        .eq('id', todayRecord.id)
        .select();

      if (error) throw error;

      toast.success("Check-out thành công!");
      setTodayRecord(data[0]);
    } catch (err) {
      console.error(err);
      toast.error(`Check-out thất bại: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setPhotoPreview(null), 3000);
      stopCamera(); // Đã xong thì tắt camera luôn cho đỡ hao pin
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const hasCheckedIn = !!todayRecord;
  const hasCheckedOut = hasCheckedIn && !!todayRecord.check_out_time;

  return (
    <div className="mx-auto px-4 sm:px-8 py-8 bg-gray-50 min-h-screen">
      <div className="mb-6 max-w-2xl mx-auto">
        <Link to="/trang-chu" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 mb-4">
          <ChevronLeft className="w-4 h-4" />
          Quay lại Trang chủ
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">Chấm công hôm nay</h1>
        <p className="text-gray-500">Người dùng: {userEmail}</p>
      </div>

      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
        
        {/* Khu vực Camera / Ảnh Preview */}
        <div className="relative mb-6 rounded-lg overflow-hidden bg-gray-900 aspect-[4/3] flex items-center justify-center">
          {photoPreview ? (
            <img src={photoPreview} alt="Captured" className="w-full h-full object-cover" />
          ) : (
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className={`w-full h-full object-cover ${(hasCheckedOut || cameraError) ? 'hidden' : ''}`}
            ></video>
          )}

          {hasCheckedOut && !photoPreview && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-green-600">
              <CheckCircle className="w-16 h-16 mb-2" />
              <p className="text-lg font-bold">Đã hoàn thành ca làm việc</p>
            </div>
          )}

          {cameraError && !hasCheckedOut && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 bg-red-50 p-4 text-center">
              <Camera className="w-12 h-12 mb-2" />
              <p>{cameraError}</p>
              <button 
                onClick={startCamera}
                className="mt-4 px-4 py-2 bg-red-100 rounded text-red-700 hover:bg-red-200 flex items-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" /> Thử lại
              </button>
            </div>
          )}
          
          <canvas ref={canvasRef} className="hidden"></canvas>
        </div>

        {/* Khu vực trạng thái & Nút thao tác */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className={`p-4 rounded-lg border ${hasCheckedIn ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
            <h3 className="text-sm text-gray-500 font-medium mb-1">Check-in</h3>
            {hasCheckedIn ? (
              <div>
                <p className="font-bold text-green-700">{new Date(todayRecord.check_in_time).toLocaleTimeString("vi-VN")}</p>
                {todayRecord.check_in_photo && (
                  <img src={todayRecord.check_in_photo} alt="Check in" className="w-12 h-12 object-cover rounded mt-2 shadow-sm border border-green-100" />
                )}
              </div>
            ) : (
              <p className="text-gray-400 italic">Chưa thực hiện</p>
            )}
          </div>
          
          <div className={`p-4 rounded-lg border ${hasCheckedOut ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
            <h3 className="text-sm text-gray-500 font-medium mb-1">Check-out</h3>
            {hasCheckedOut ? (
              <div>
                <p className="font-bold text-green-700">{new Date(todayRecord.check_out_time).toLocaleTimeString("vi-VN")}</p>
                {todayRecord.check_out_photo && (
                  <img src={todayRecord.check_out_photo} alt="Check out" className="w-12 h-12 object-cover rounded mt-2 shadow-sm border border-green-100" />
                )}
              </div>
            ) : (
              <p className="text-gray-400 italic">Chưa thực hiện</p>
            )}
          </div>
        </div>

        {/* Nút hành động */}
        <div className="flex justify-center">
          {!hasCheckedIn && (
            <button
              onClick={handleCheckIn}
              disabled={isProcessing || !!cameraError}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center text-lg shadow-lg"
            >
              <LogIn className="w-5 h-5" />
              {isProcessing ? "Đang xử lý..." : "CHECK IN"}
            </button>
          )}

          {hasCheckedIn && !hasCheckedOut && (
            <button
              onClick={handleCheckOut}
              disabled={isProcessing || !!cameraError}
              className="flex items-center gap-2 px-8 py-3 bg-orange-600 text-white rounded-lg font-bold hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center text-lg shadow-lg"
            >
              <LogOut className="w-5 h-5" />
              {isProcessing ? "Đang xử lý..." : "CHECK OUT"}
            </button>
          )}

          {hasCheckedOut && (
            <div className="w-full text-center p-3 bg-gray-100 text-gray-600 rounded-lg font-medium">
              Bạn đã hoàn thành điểm danh hôm nay!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
