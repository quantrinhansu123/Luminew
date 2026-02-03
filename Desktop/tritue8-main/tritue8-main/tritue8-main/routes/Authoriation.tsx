import { useAuth } from "@/contexts/AuthContext";
import React from "react";
import { Link } from "react-router-dom";

const Authoriation = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, userProfile, loading } = useAuth();
  console.log("Authoriation - User Profile:", userProfile);
  
  // Show loading state
  if (loading) {
    return (
      <div className="container p-6">
        <div className="text-center">Đang tải...</div>
      </div>
    );
  }
  
  // Check if user is admin by either isAdmin flag or role
  const isAdmin = userProfile?.isAdmin === true || userProfile?.role?.toLowerCase() === "admin";
  
  if (userProfile && !isAdmin) {
    return (
      <div className="container p-6">
        <h2 className="text-2xl font-semibold mb-2">Không có quyền truy cập</h2>
        <p className="mb-4">Bạn không có quyền truy cập khu vực quản trị.</p>
        <Link to="/" className="text-primary underline">
          Quay về trang chủ
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};

export default Authoriation;
