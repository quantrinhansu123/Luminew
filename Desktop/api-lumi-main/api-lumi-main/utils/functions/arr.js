/**
 * Namespace chứa các hàm liên quan đến mảng.
 */
const Arr = {
  /**
   * Chuyển đổi một mảng thành một instance của một class.
   * @param {any[]} arr - Mảng chứa các giá trị.
   * @param {new () => T} ClassType - Class để tạo instance.
   * @returns {T} - Instance của class đã được tạo và ánh xạ giá trị.
   * @template T
   */
  arrayToClass: function (arr, ClassType) {
    const instance = new ClassType(); // Khởi tạo instance từ class truyền vào
    const keys = Object.keys(instance); // Lấy danh sách thuộc tính từ instance

    keys.forEach((key, index) => {
      if (index < arr.length) {
        instance[key] = arr[index]; // Ánh xạ giá trị vào instance
      }
    });

    return instance;
  },
};

export default Arr;