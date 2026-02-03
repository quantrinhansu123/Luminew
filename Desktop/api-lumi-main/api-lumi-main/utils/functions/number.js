/**
 * Hàm định dạng số thành tiền tệ.
 * @param {number} number - Số cần định dạng.
 * @param {string} currency - Ký hiệu tiền tệ (ví dụ: "VND", "USD").
 * @param {string} locale - Mã locale (ví dụ: "vi-VN", "en-US").
 * @returns {string} - Chuỗi tiền tệ đã được định dạng.
 */
export const formatCurrency = (number, currency = "VND", locale = "vi-VN") => {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(number);
};

/**
 * Hàm giới hạn giá trị số trong một khoảng cho phép.
 * @param {number} value - Giá trị số cần giới hạn.
 * @param {number} min - Giá trị nhỏ nhất.
 * @param {number} max - Giá trị lớn nhất.
 * @returns {number} - Giá trị đã được giới hạn.
 */
export const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};