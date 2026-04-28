# Sửa lỗi cố định cột (Sticky Columns) - Trang Vận đơn

## Vấn đề
- Các cột đầu tiên không được cố định khi cuộn ngang
- Trước đây có tùy chọn số cột ghim nhưng đã bị mất
- Code đã fix cứng chỉ 1 cột được ghim

## Nguyên nhân
1. **Cố định cứng số cột**: Dòng 3008 có code `const effectiveFixedColumns = Math.min(1, currentColumns.length);` - chỉ cho phép ghim 1 cột
2. **Không có state để điều chỉnh**: Không có state `numFixedColumns` để người dùng thay đổi
3. **Thiếu UI điều khiển**: Không có nút +/- để tăng/giảm số cột ghim
4. **Dependency thiếu**: useLayoutEffect tính toán sticky offsets không có `numFixedColumns` trong dependency array

## Giải pháp đã áp dụng

### 1. Thêm state cho số cột cố định (dòng ~3008)
```javascript
const [numFixedColumns, setNumFixedColumns] = useState(() => {
  const saved = localStorage.getItem('vanDon_numFixedColumns');
  return saved ? Math.max(1, Math.min(Number(saved), 5)) : 1;
});

// Lưu vào localStorage
useEffect(() => {
  localStorage.setItem('vanDon_numFixedColumns', String(numFixedColumns));
}, [numFixedColumns]);

const effectiveFixedColumns = Math.min(numFixedColumns, currentColumns.length);
```

### 2. Thêm UI điều khiển (dòng ~5182)
Thêm một control nhỏ gọn ngay sau nút "Cài đặt cột":
- Hiển thị số cột hiện tại đang ghim
- Nút `-` để giảm (tối thiểu 1 cột)
- Nút `+` để tăng (tối đa 5 cột)
- Lưu tự động vào localStorage

```javascript
<div className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 border border-gray-300">
  <span className="text-[11px] text-gray-700 font-medium whitespace-nowrap">📌 Ghim:</span>
  <button onClick={() => setNumFixedColumns(Math.max(1, numFixedColumns - 1))} ...>−</button>
  <span className="text-[11px] font-bold text-gray-800">{numFixedColumns}</span>
  <button onClick={() => setNumFixedColumns(Math.min(5, currentColumns.length, numFixedColumns + 1))} ...>+</button>
  <span className="text-[10px] text-gray-500">cột</span>
</div>
```

### 3. Cập nhật dependency array (dòng ~3126)
Thêm `numFixedColumns` vào dependency của useLayoutEffect để tính lại sticky offsets khi thay đổi số cột ghim:
```javascript
}, [currentColumns, checkboxStickyPad, getColumnWidthPx, filterValues, isLongTextExpanded, numFixedColumns]);
```

## Cách sử dụng
1. Mở trang Vận đơn
2. Tìm control "📌 Ghim: - [số] + cột" trên toolbar (ngay sau nút "⚙️ Cài đặt cột")
3. Nhấn nút `+` để tăng số cột cố định (tối đa 5)
4. Nhấn nút `-` để giảm số cột cố định (tối thiểu 1)
5. Cuộn ngang bảng để thấy các cột đầu tiên vẫn cố định

## Kết quả
✅ Người dùng có thể điều chỉnh số cột cố định từ 1-5 cột
✅ Cài đặt được lưu vào localStorage và giữ nguyên khi reload trang
✅ Sticky positioning hoạt động đúng với số cột đã chọn
✅ UI đơn giản, dễ sử dụng, không chiếm nhiều không gian
