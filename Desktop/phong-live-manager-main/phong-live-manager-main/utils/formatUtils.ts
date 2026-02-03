/**
 * Format currency với dấu phẩy ngăn cách hàng nghìn
 * @param val - Giá trị số tiền
 * @returns Chuỗi đã format với dấu phẩy ngăn cách và đơn vị VND
 */
export const formatCurrency = (val: number): string => {
  // Format số với dấu phẩy ngăn cách hàng nghìn
  const formatted = Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formatted} ₫`;
};

/**
 * Parse currency từ string có format "0₫" hoặc "300.010₫"
 * @param str - Chuỗi currency
 * @returns Số tiền
 */
export const parseCurrency = (str: string | number): number => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  // Loại bỏ dấu VND, dấu chấm, dấu phẩy và khoảng trắng
  const cleaned = str.toString().replace(/[₫,.\s]/g, '').trim();
  return parseInt(cleaned) || 0;
};

/**
 * Parse percentage từ string có format "10.53%" hoặc "10.53"
 * @param str - Chuỗi percentage
 * @returns Số percentage (0-100)
 */
export const parsePercentage = (str: string | number): number => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = str.toString().replace(/[%\s]/g, '').trim();
  return parseFloat(cleaned) || 0;
};

/**
 * Format percentage thành string "10.53%"
 * @param val - Giá trị percentage (0-100)
 * @returns Chuỗi đã format
 */
export const formatPercentage = (val: number): string => {
  return `${val.toFixed(2)}%`;
};

/**
 * Format currency cho Excel (dùng dấu chấm ngăn cách như trong mẫu: 300.010₫)
 * @param val - Giá trị số tiền
 * @returns Chuỗi đã format với dấu chấm ngăn cách và đơn vị VND
 */
export const formatCurrencyForExcel = (val: number): string => {
  // Format số với dấu chấm ngăn cách hàng nghìn (như trong mẫu Excel)
  const formatted = Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}₫`;
};

/**
 * Normalize tên để so sánh (trim, normalize khoảng trắng, lowercase)
 * @param name - Tên cần normalize
 * @returns Tên đã được normalize
 */
export const normalizeName = (name: string | null | undefined): string => {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s+/g, ' ') // Normalize nhiều khoảng trắng thành 1 khoảng trắng
    .toLowerCase();
};

/**
 * So sánh 2 tên có khớp nhau không (sau khi normalize)
 * @param name1 - Tên thứ nhất
 * @param name2 - Tên thứ hai
 * @returns true nếu khớp nhau
 */
export const matchNames = (name1: string | null | undefined, name2: string | null | undefined): boolean => {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);
  
  if (!normalized1 || !normalized2) return false;
  
  // Exact match
  if (normalized1 === normalized2) return true;
  
  // One contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
  
  return false;
};



