import { useState } from "react";

export default function HRDashboard() {
    const [loading, setLoading] = useState(true);

    return (
        <div className="w-full h-[calc(100vh-64px)] bg-gray-50 flex flex-col">
            <iframe
                src="https://hr-management-self.vercel.app/dashboard"
                title="Hệ thống Quản trị Nhân sự"
                className="w-full flex-1 border-none"
                onLoad={() => setLoading(false)}
            />
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                </div>
            )}
        </div>
    );
}
