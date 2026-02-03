'use client';

import React from 'react';

export type QuotationLine = {
  name: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
};

export type QuotationPdfData = {
  quotationCode: string;
  createdDate: string;
  company: {
    name: string;
    representativeName?: string;
    representativeTitle?: string;
    address?: string;
    phone?: string;
    email?: string;
    taxCode?: string;
    website?: string;
    logoUrl?: string;
  };
  customer: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    companyName?: string;
    taxCode?: string;
  };
  lines: QuotationLine[];
  note?: string;
  subtotal: number;
  totalAmount: number;
};

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
};

export const QuotationTemplate = ({ data }: { data: QuotationPdfData }) => {
  return (
    <div className="quotation-print-container bg-white text-black p-10 mx-auto text-sm font-sans leading-relaxed">
      {/* HEADER: Logo & Company Info */}
      <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
        <div className="w-1/3">
          {data.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.company.logoUrl}
              alt="Company Logo"
              className="h-20 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="h-20 w-20 bg-gray-200 flex items-center justify-center font-bold text-gray-400 rounded">
              LOGO
            </div>
          )}
        </div>
        <div className="w-2/3 text-right">
          <h2 className="text-xl font-bold uppercase text-blue-900 mb-1">{data.company.name}</h2>
          {(data.company.representativeName || data.company.representativeTitle) && (
            <p className="text-xs text-gray-600">
              {data.company.representativeName ? `Người đại diện: ${data.company.representativeName}` : ''}
              {data.company.representativeName && data.company.representativeTitle ? ' | ' : ''}
              {data.company.representativeTitle ? `Chức vụ: ${data.company.representativeTitle}` : ''}
            </p>
          )}
          <p className="text-gray-600">{data.company.address}</p>
          <div className="flex justify-end gap-4 mt-1 text-xs text-gray-500">
            {data.company.phone && <span>Tel: {data.company.phone}</span>}
            {data.company.email && <span>Email: {data.company.email}</span>}
          </div>
          {data.company.website && <p className="text-xs text-gray-500">Web: {data.company.website}</p>}
          {data.company.taxCode && <p className="text-xs text-gray-500">MST: {data.company.taxCode}</p>}
        </div>
      </div>

      {/* TITLE SECTION */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold uppercase tracking-wider mb-2">Bảng Báo Giá</h1>
        <div className="flex justify-center gap-8 text-gray-600 italic">
          <span>
            Số: <span className="font-semibold text-black not-italic">{data.quotationCode}</span>
          </span>
          <span>
            Ngày: <span className="font-semibold text-black not-italic">{data.createdDate}</span>
          </span>
        </div>
      </div>

      {/* CUSTOMER INFO */}
      <div className="bg-gray-50 p-6 rounded-lg mb-8 border border-gray-200">
        <h3 className="font-bold text-blue-900 border-b border-gray-300 pb-2 mb-3 uppercase text-xs tracking-wide">
          Thông tin khách hàng
        </h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <div className="col-span-2">
            <span className="text-gray-500 inline-block w-24">Đơn vị/Ông bà:</span>
            <span className="font-bold">{data.customer.companyName || data.customer.name}</span>
          </div>
          {data.customer.companyName && (
            <div className="col-span-2">
              <span className="text-gray-500 inline-block w-24">Người liên hệ:</span>
              <span>{data.customer.name}</span>
            </div>
          )}
          <div className="col-span-2 sm:col-span-1">
            <span className="text-gray-500 inline-block w-24">Điện thoại:</span>
            <span>{data.customer.phone || '...'}</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-gray-500 inline-block w-24">Email:</span>
            <span>{data.customer.email || '...'}</span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-500 inline-block w-24">Địa chỉ:</span>
            <span>{data.customer.address || '...'}</span>
          </div>
          {data.customer.taxCode && (
            <div className="col-span-2">
              <span className="text-gray-500 inline-block w-24">Mã số thuế:</span>
              <span>{data.customer.taxCode}</span>
            </div>
          )}
        </div>
      </div>

      {/* ITEMS TABLE */}
      <div className="mb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-blue-900 text-white text-xs uppercase text-left">
              <th className="py-3 px-3 w-12 text-center border-r border-blue-800">STT</th>
              <th className="py-3 px-3 border-r border-blue-800">Tên hàng hóa / Dịch vụ</th>
              <th className="py-3 px-3 w-20 text-center border-r border-blue-800">ĐVT</th>
              <th className="py-3 px-3 w-20 text-center border-r border-blue-800">SL</th>
              <th className="py-3 px-3 w-32 text-right border-r border-blue-800">Đơn giá</th>
              <th className="py-3 px-3 w-36 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody className="text-gray-700 text-sm">
            {data.lines.map((line, index) => (
              <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-3 px-3 text-center align-top text-gray-500">{index + 1}</td>
                <td className="py-3 px-3 align-top font-medium whitespace-pre-line">{line.name}</td>
                <td className="py-3 px-3 text-center align-top">{line.unit}</td>
                <td className="py-3 px-3 text-center align-top font-semibold">{line.quantity}</td>
                <td className="py-3 px-3 text-right align-top">{formatCurrency(line.price)}</td>
                <td className="py-3 px-3 text-right align-top font-semibold text-gray-900">
                  {formatCurrency(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* TOTALS SECTION */}
      <div className="flex justify-end mb-8">
        <div className="w-1/2 sm:w-1/3">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600 font-medium">Cộng tiền hàng:</span>
            <span className="font-bold">{formatCurrency(data.subtotal)}</span>
          </div>

          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600 font-medium">Thuế VAT (0%):</span>
            <span className="font-bold">0 ₫</span>
          </div>

          <div className="flex justify-between py-3 border-t-2 border-blue-900 mt-2">
            <span className="text-blue-900 font-bold uppercase">Tổng cộng:</span>
            <span className="text-xl font-bold text-red-600">{formatCurrency(data.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* NOTES & SIGNATURES */}
      <div className="grid grid-cols-2 gap-12 mt-12 break-inside-avoid">
        <div>
          <h4 className="font-bold text-sm uppercase mb-2">Ghi chú & Điều khoản:</h4>
          <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
            <li>Báo giá có hiệu lực trong vòng 15 ngày kể từ ngày ký.</li>
            <li>Thanh toán 100% sau khi nghiệm thu/giao hàng.</li>
            <li>Chưa bao gồm chi phí vận chuyển (nếu có).</li>
            {data.note && <li className="text-gray-800 font-medium">{data.note}</li>}
          </ul>
        </div>

        {/* Signature Block */}
        <div className="flex justify-between text-center pt-4">
          <div className="w-1/2">
            <p className="font-bold text-sm uppercase mb-16">Khách hàng</p>
            <p className="text-xs italic text-gray-400">(Ký, ghi rõ họ tên)</p>
          </div>
          <div className="w-1/2">
            <p className="font-bold text-sm uppercase mb-16">Đại diện công ty</p>
            <p className="font-bold text-sm mt-8">{data.company.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

