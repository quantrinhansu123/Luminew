import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function ExternalView() {
    const location = useLocation();
    const navigate = useNavigate();
    const [url, setUrl] = useState("");

    useEffect(() => {
        // Lấy URL từ query parameter
        const queryParams = new URLSearchParams(location.search);
        const targetUrl = queryParams.get("url");
        if (targetUrl) {
            const decodedUrl = decodeURIComponent(targetUrl);
            // Backward-compat: old MKT external links now use internal app page.
            // Chỉ chuyển sang trang MKT nội bộ cho bản cũ viewNsMoiNhanh (không chặn nhanSuSaleLumiMoi — dùng cho /xem-bao-cao-sale & /xem-bao-cao-cskh)
            if (decodedUrl.includes("viewNsMoiNhanh.html")) {
                navigate("/xem-bao-cao-mkt", { replace: true });
                return;
            }
            setUrl(decodedUrl);
        }
    }, [location.search, navigate]);

    if (!url) {
        return (
            <div className="flex items-center justify-center min-h-[calc(100vh-64px)]">
                <p>Đang tải nội dung...</p>
            </div>
        );
    }

    return (
        <div className="w-full h-[calc(100vh-64px)] overflow-hidden">
            <iframe
                src={url}
                className="w-full h-full border-none"
                title="External View"
                allow="clipboard-read; clipboard-write"
            />
        </div>
    );
}
