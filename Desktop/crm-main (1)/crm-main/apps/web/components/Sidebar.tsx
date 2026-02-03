'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LogOut, 
  ClipboardList, 
  PlusCircle, 
  TrendingUp, 
  BarChart3, 
  Database, 
  History,
  FileText,
  Image,
  Palette,
  FolderOpen
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();

  // Define the menu structure - only functional pages
  const menuGroups = [
    {
      title: "QUẢN LÝ SALE & ORDER",
      items: [
        { 
          href: '/sale-order-menu', 
          label: 'Menu Sale & Order', 
          icon: ClipboardList,
          iconColor: 'text-purple-400'
        },
      ]
    },
    {
      title: "PHÒNG KINH DOANH",
      items: [
        { href: '/leads', label: 'Hộp chờ tư vấn' },
        { href: '/orders', label: 'Đơn hàng' },
        { href: '/customers', label: 'Khách hàng' },
        { href: '/lich-su-giao-dich', label: 'Lịch sử giao dịch' },
        { href: '/lead-sources', label: 'Nguồn Lead' },
        { href: '/product-groups', label: 'Nhóm Sản phẩm' },
        { href: '/materials', label: 'Kho vật liệu' },
        { href: '/labor-costs', label: 'Bảng giá công' },
        { href: '/sales-allocation', label: 'Phân bổ Sale' },
        { href: '/sales-employees', label: 'Nhân viên Sale' },
      ]
    },
    {
      title: "BÌNH FILE",
      items: [
        { href: '/binh-file', label: 'Bình File Giấy' },
        { href: '/binh-file-hop', label: 'Bình File Hộp' },
        { href: '/binh-file-tui', label: 'Bình File Túi' },
        { href: '/design-tasks', label: 'Yêu cầu thiết kế', icon: Palette, iconColor: 'text-blue-400' },
        { href: '/kho-thiet-ke', label: 'Kho thiết kế', icon: FolderOpen, iconColor: 'text-purple-400' },
      ]
    },
    {
      title: "QUẢN LÝ",
      items: [
        { href: '/dashboard', label: 'Dashboard & KPI' },
        { href: '/company-profile', label: 'Thông tin công ty' },
      ]
    }
  ];

  // Prefetch routes so switching tabs feels instant
  useEffect(() => {
    const hrefs = menuGroups.flatMap((g) => g.items.map((i) => i.href));
    const run = () => {
      for (const href of hrefs) {
        // Next router in App Router supports prefetch
        router.prefetch(href);
      }
    };

    // Avoid blocking initial render
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 300);
    }
  }, [router]);

  return (
    <div className="w-80 bg-[#1a365d] text-slate-200 min-h-screen flex flex-col shadow-xl border-r border-slate-700">
      {/* Header */}
      <div className="h-20 flex items-center justify-start px-8 gap-4 border-b border-slate-700/50 bg-[#0f2744]">
        <div className="min-w-[40px] w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shadow-lg shrink-0 bg-white">
          <img src="/logo.jpg" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="font-bold text-white text-lg leading-none">CRM Pro</h1>
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Lead Master</span>
        </div>
      </div>

      {/* Scrollable Menu Area */}
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
        {menuGroups.map((group, index) => (
          <div key={index} className="space-y-2">
            {/* Group Title */}
            <div className="px-4 mb-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
              {group.title}
            </div>

            <div className="space-y-2">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    onMouseEnter={() => router.prefetch(item.href)}
                    className={`flex items-center gap-4 rounded-lg transition-all duration-200 px-4 py-3.5 w-full text-base
                    ${isActive
                      ? 'bg-blue-400/90 text-white font-semibold shadow-lg'
                      : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                    }`}
                  >
                    {Icon && (
                      <Icon 
                        size={22} 
                        className={`shrink-0 ${isActive ? 'text-white' : item.iconColor || 'text-slate-400'}`} 
                      />
                    )}
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-700/50 bg-[#0f2744]">
        <div className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-slate-700/50 cursor-pointer transition-colors">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg text-base shrink-0">
            AD
          </div>

          <div className="overflow-hidden min-w-[120px]">
            <p className="text-base font-semibold text-white truncate">Admin User</p>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <p className="text-sm text-slate-400">Đang hoạt động</p>
            </div>
          </div>

          <LogOut size={20} className="text-slate-400 hover:text-red-400 ml-auto" />
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
