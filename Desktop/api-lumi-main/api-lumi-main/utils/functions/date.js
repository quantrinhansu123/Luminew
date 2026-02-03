/**
 * Namespace chứa các hàm liên quan đến thời gian.
 */
const Dates = {
  /**
   * Định dạng một đối tượng Date thành chuỗi ngày tháng theo locale "vi-VN".
   * @param {Date} date - Đối tượng Date cần định dạng.
   * @returns {string} - Chuỗi ngày tháng đã được định dạng theo định dạng "dd/MM/yyyy".
   */
  toLocaleDateString: (date) => {
    return date.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  },

  /**
   * Lấy ngày bắt đầu và ngày kết thúc của một khoảng thời gian (tháng, quý, năm).
   * @param {string} type - Loại khoảng thời gian: "month", "quarter", hoặc "year".
   * @returns {{start: string, end: string}} - Một đối tượng chứa ngày bắt đầu và ngày kết thúc, đã được định dạng thành chuỗi.
   * @throws {Error} - Nếu loại không hợp lệ.
   */
  getStartAndEndDates: (type) => {
    const now = new Date(); // Lấy ngày hiện tại
    let startDate, endDate;

    switch (type) {
      case "month":
        // Ngày đầu tiên và cuối cùng của tháng
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;

      case "quarter":
        // Tính quý hiện tại
        const quarter = Math.floor(now.getMonth() / 3); // 0-based: 0-Q1, 1-Q2...
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        break;

      case "year":
        // Ngày đầu tiên và cuối cùng của năm
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 12, 0);
        break;

      default:
        throw new Error(
          "Loại không hợp lệ. Hãy chọn 'month', 'quarter', hoặc 'year'."
        );
    }

    return {
      start: Dates.toLocaleDateString(startDate),
      end: Dates.toLocaleDateString(endDate),
    };
  },
};

export default Dates;