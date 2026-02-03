'use client';

import React from 'react';
import Link from 'next/link';
import {
  Users,
  ShoppingCart,
  UserCircle,
  Target,
  UserCheck,
  TrendingUp,
  BarChart3,
  Database,
  History,
  Wrench,
  Box,
  Package,
  FileText,
  Layout,
  BarChart,
  Building2,
  Palette,
  FolderOpen,
} from 'lucide-react';

const menuGroups = [
  {
    title: 'CRM',
    items: [
      {
        href: '/leads',
        title: 'Hộp chờ tư vấn',
        icon: Users,
        iconBg: 'bg-blue-500',
      },
      {
        href: '/orders',
        title: 'Đơn hàng',
        icon: ShoppingCart,
        iconBg: 'bg-green-500',
      },
      {
        href: '/customers',
        title: 'Khách hàng',
        icon: UserCircle,
        iconBg: 'bg-emerald-500',
      },
    ],
  },
  {
    title: 'PHÒNG KINH DOANH',
    items: [
      {
        href: '/lead-sources',
        title: 'Nguồn Lead',
        icon: Target,
        iconBg: 'bg-indigo-500',
      },
      {
        href: '/sales-allocation',
        title: 'Phân bổ Sale',
        icon: UserCheck,
        iconBg: 'bg-violet-500',
      },
      {
        href: '/bao-cao-mkt',
        title: 'Báo cáo MKT',
        icon: TrendingUp,
        iconBg: 'bg-blue-500',
      },
      {
        href: '/dashboard',
        title: 'Xem báo cáo',
        icon: BarChart3,
        iconBg: 'bg-orange-500',
      },
      {
        href: '/kpis',
        title: 'KPIs',
        icon: Database,
        iconBg: 'bg-cyan-500',
      },
      {
        href: '/dashboard',
        title: 'Lịch sử thay đổi',
        icon: History,
        iconBg: 'bg-slate-600',
      },
    ],
  },
  {
    title: 'SẢN PHẨM',
    items: [
      {
        href: '/labor-costs',
        title: 'Bảng giá công',
        icon: Wrench,
        iconBg: 'bg-teal-500',
      },
      {
        href: '/materials',
        title: 'Kho vật liệu',
        icon: Box,
        iconBg: 'bg-amber-500',
      },
      {
        href: '/product-groups',
        title: 'Nhóm sản phẩm',
        icon: Package,
        iconBg: 'bg-pink-500',
      },
    ],
  },
  {
    title: 'BÌNH FILE',
    items: [
      {
        href: '/binh-file',
        title: 'Bình file giấy',
        icon: FileText,
        iconBg: 'bg-sky-500',
      },
      {
        href: '/binh-file-hop',
        title: 'Bình file hộp',
        icon: Layout,
        iconBg: 'bg-blue-600',
      },
      {
        href: '/binh-file-tui',
        title: 'Bình file túi',
        icon: Package,
        iconBg: 'bg-green-600',
      },
      {
        href: '/design-tasks',
        title: 'Yêu cầu thiết kế',
        icon: Palette,
        iconBg: 'bg-blue-500',
      },
      {
        href: '/kho-thiet-ke',
        title: 'Kho thiết kế',
        icon: FolderOpen,
        iconBg: 'bg-purple-500',
      },
    ],
  },
  {
    title: 'QUẢN LÝ',
    items: [
      {
        href: '/dashboard',
        title: 'Dashboard & KPI',
        icon: BarChart,
        iconBg: 'bg-blue-500',
      },
      {
        href: '/company-profile',
        title: 'Thông tin công ty',
        icon: Building2,
        iconBg: 'bg-slate-500',
      },
    ],
  },
];

export default function SaleOrderMenuPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-8 relative overflow-hidden">
      {/* Logo watermark background */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: 'url(/logo.jpg)',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          backgroundSize: 'contain',
        }}
      />
      
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">QUẢN LÝ SALE & ORDER</h1>
        </div>

        {/* Menu Groups */}
        <div className="space-y-8">
          {menuGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Group Title */}
              <h2 className="text-xl font-bold text-slate-700 mb-4">{group.title}</h2>
              
              {/* Menu Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.items.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={index}
                      href={item.href}
                      className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-200 hover:border-blue-300"
                    >
                      <div className="p-6 flex items-center gap-4">
                        {/* Icon bên trái */}
                        <div className={`${item.iconBg} w-16 h-16 rounded-lg flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 shrink-0`}>
                          <Icon size={32} className="text-white" />
                        </div>

                        {/* Text bên phải */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </h3>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
