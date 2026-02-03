/**
 * Hàm kiểm tra xem một chuỗi có phải là chuỗi rỗng hay không.
 * @param {string} str - Chuỗi cần kiểm tra.
 * @returns {boolean} - True nếu chuỗi rỗng, ngược lại trả về false.
 */
export const isEmptyString = (str) => {
  return str === null || str === undefined || str.trim() === "";
};

/**
 * Hàm viết hoa chữ cái đầu của một chuỗi.
 * @param {string} str - Chuỗi cần viết hoa.
 * @returns {string} - Chuỗi đã được viết hoa chữ cái đầu.
 */
export const capitalizeFirstLetter = (str) => {
  if (isEmptyString(str)) {
    return "";
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
};