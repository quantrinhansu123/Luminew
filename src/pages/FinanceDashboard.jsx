import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function FinanceDashboard() {
    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm z-10 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        to="/"
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">Finance Manager</h1>
                        <p className="text-xs text-gray-500">Hệ thống quản lý tài chính</p>
                    </div>
                </div>
            </div>

            {/* Iframe Content */}
            <div className="flex-1 w-full bg-white relative">
                <iframe
                    src="https://lumi-finance-manager.vercel.app/"
                    title="Finance Dashboard"
                    className="w-full h-full border-0 absolute inset-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                />
            </div>
        </div>
    );
}
