const Obj = {
  /**
   * Chuyển đổi một object thành một instance của một class.
   * @param {object} obj - Object cần chuyển đổi.
   * @param {new () => T} ClassType - Class để tạo instance.
   * @returns {T} - Instance của class đã được tạo và ánh xạ giá trị.
   * @template T
   */
  objectToClass: function (obj, ClassType) {
    const instance = new ClassType(); // Khởi tạo instance từ class truyền vào
    const keys = Object.keys(instance); // Lấy danh sách thuộc tính từ instance
    keys.forEach((key) => {
      if (obj.hasOwnProperty(key)) {
        instance[key] = obj[key]; // Ánh xạ giá trị vào instance
      }
    });

    return instance;
  },
};

export default Obj;