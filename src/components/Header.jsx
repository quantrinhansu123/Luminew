import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const username = localStorage.getItem("username") || "User";
  const userRole = localStorage.getItem("userRole") || "user";
  const userTeam = localStorage.getItem("userTeam") || "";

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userTeam");
    navigate("/dang-nhap");
  };

  // Don't show header on login page or home page (which has its own sidebar/topbar)
  if (location.pathname === "/dang-nhap" || location.pathname === "/" || location.pathname === "/trang-chu") {
    return null;
  }

  /** Dashboard quản trị: thanh mỏng hơn để ưu tiên iframe báo cáo */
  const compact = location.pathname === "/dashboard-quan-tri";

  return (
    <nav className="bg-green-600 shadow-lg sticky top-0 z-50">
      <div className={`mx-auto ${compact ? "px-3 sm:px-4" : "px-8"}`}>
        <div className={`flex items-center justify-between ${compact ? "h-11 min-h-[2.75rem]" : "h-16"}`}>
          <div className={`flex items-center ${compact ? "space-x-2" : "space-x-4"}`}>
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
              alt="Logo"
              className={`rounded-full shadow-md ${compact ? "h-7 w-7" : "h-10 w-10"}`}
            />
            <span className={`text-white font-bold ${compact ? "text-sm sm:text-base" : "text-xl"}`}>
              LUMI OMS
            </span>
          </div>
          <div className={`flex items-center ${compact ? "space-x-1.5" : "space-x-4"}`}>
            <Link
              to="/trang-chu"
              className={`text-white hover:bg-green-700 rounded-md font-medium transition ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
            >
              Trang chủ
            </Link>

            {/* <Link
              to="/bang-bao-cao"
              className="text-white hover:bg-green-700 px-3 py-2 rounded-md text-sm font-medium transition"
            >
              Bảng báo cáo
            </Link>
            {(["admin", "kế toán", "vận đơn"].includes(userRole) ||
              String(userTeam || "")
                .toLowerCase()
                .includes("vận đơn")) && (
              <Link
                to="/van-don"
                className="text-white hover:bg-green-700 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Vận đơn
              </Link>
            )} */}

            {isAuthenticated && (
              <div
                className={`flex items-center border-l border-green-600 ${compact ? "ml-2 space-x-1.5 pl-2" : "ml-4 space-x-3 pl-4"}`}
              >
                <Link
                  to="/ho-so"
                  className={`text-white hover:bg-green-700 rounded-md font-medium transition ${compact ? "max-w-[9rem] truncate px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
                  title={username}
                >
                  👤 {username}
                </Link>
                <button
                  onClick={handleLogout}
                  className={`text-white hover:bg-red-600 bg-red-500 rounded-md font-medium transition ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
