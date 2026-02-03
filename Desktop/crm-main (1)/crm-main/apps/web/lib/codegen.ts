'use client';

function rand4() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function timePart() {
  return Date.now().toString(36).toUpperCase();
}

function make(prefix: string) {
  return `${prefix}${timePart()}${rand4()}`;
}

export function generateOrderCode() {
  // ĐH = Đơn hàng
  return make('DH');
}

export function generateCustomerCode() {
  // KH = Khách hàng
  return make('KH');
}

export function generateSalesEmployeeCode() {
  // NV = Nhân viên
  return make('NV');
}

export function generateAllocationRuleCode() {
  // SP = Nhóm/Sản phẩm (rule phân bổ)
  return make('SP');
}

export function generateQuotationCode() {
  // BG = Báo giá
  return make('BG');
}

export function generateProductGroupCode() {
  // PG = Product Group
  return make('PG');
}

