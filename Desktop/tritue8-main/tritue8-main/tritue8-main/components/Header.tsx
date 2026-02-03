import { useAuth } from "@/contexts/AuthContext";
import { Button } from "antd";
import { Link, NavLink } from "react-router-dom";

const Header = () => {
  const { currentUser } = useAuth();
  return (
    <header className="bg-white">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <NavLink to="/" className="flex items-center gap-2">
          <img
            src="/img/logo.png"
            alt="Trí Tuệ 8+ Logo"
            className="h-24 w-auto"
          />
        </NavLink>
        <nav className="hidden gap-8 md:flex">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive
                ? "text-primary border-primary border-b-2 "
                : "hover:text-primary text-gray-700"
            }
          >
            Trang Chủ
          </NavLink>
          <NavLink
            to="/courses"
            className={({ isActive }) =>
              isActive
                ? "text-primary border-primary border-b-2 "
                : "hover:text-primary text-gray-700"
            }
          >
            Chương Trình Học
          </NavLink>
          <NavLink
            to="/about"
            className={({ isActive }) =>
              isActive
                ? "text-primary border-primary border-b-2 "
                : "hover:text-primary text-gray-700"
            }
          >
            Giới Thiệu
          </NavLink>
          <NavLink
            to="/contact"
            className={({ isActive }) =>
              isActive
                ? "text-primary border-primary border-b-2 "
                : "hover:text-primary text-gray-700"
            }
          >
            Liên Hệ
          </NavLink>
        </nav>
        {!currentUser && (
          <Button type="primary">
            <Link to="/login">Đăng Nhập</Link>
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;
