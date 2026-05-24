# Danh sách các Link Database đang sử dụng

## 1. Firebase Realtime Database (Lumi)

### Base URL:
```
https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app
```

### Các endpoint được sử dụng:

#### a) F3 Data (Đơn hàng)
- **URL**: `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json`
- **Sử dụng trong**:
  - `src/pages/BaoCaoChiTiet.jsx`
  - `src/pages/BaoCaoHieuSuatKPI.jsx`
  - `src/hooks/useF3Data.js`
  - `src/pages/ChangeLogViewer.jsx`

#### b) Báo cáo MKT
- **URL**: `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Báo_cáo_MKT.json`
- **Sử dụng trong**:
  - `src/pages/BaoCaoChiTiet.jsx`
  - `src/pages/ReportForm.jsx`
  - `src/pages/BaoCaoMarketing.jsx`

#### c) Nhân sự
- **URL**: `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nhân_sự.json`
- **Sử dụng trong**:
  - `src/pages/BaoCaoChiTiet.jsx`

#### d) Tài khoản
- **URL**: `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Tài_khoản.json`
- **Sử dụng trong**:
  - `src/pages/Profile.jsx`
  - `src/hooks/useF3Data.js`

#### e) ChangeLog (Lịch sử thay đổi)
- **URL**: `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/ChangeLog.json`
- **Sử dụng trong**:
  - `src/pages/ChangeLogViewer.jsx`

#### f) Users
- **URL**: `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/users/{userId}.json`
- **Sử dụng trong**:
  - `src/pages/Profile.jsx`

---

## 2. Firebase Realtime Database (Report - Firebase SDK)

### Base URL:
```
https://report-55c9f-default-rtdb.asia-southeast1.firebasedatabase.app
```

### Config trong `src/firebase/config.js`:
```javascript
apiKey: "AIzaSyASyxDOJ_pGwjBaQqThoYQRmWyq2sq6Eh0"
authDomain: "report-55c9f.firebaseapp.com"
databaseURL: "https://report-55c9f-default-rtdb.asia-southeast1.firebasedatabase.app"
projectId: "report-55c9f"
```

### Các endpoint được sử dụng:
- **detail_reports**: Sử dụng trong `src/hooks/useReportData.js`
- Sử dụng Firebase SDK thay vì REST API

---

## 3. API Server (Vercel)

### Base URL:
```
https://n-api-gamma.vercel.app
```

### Các endpoint được sử dụng:

#### a) F3 Sheet Data
- **URL**: `https://n-api-gamma.vercel.app/sheet/F3/data`
- **Method**: GET
- **Sử dụng trong**: `src/services/api.js` → `fetchOrders()`

#### b) F3 Sheet Update Single
- **URL**: `https://n-api-gamma.vercel.app/sheet/F3/update-single`
- **Method**: PATCH
- **Sử dụng trong**: `src/services/api.js` → `updateSingleCell()`

#### c) F3 Sheet Batch Update
- **URL**: `https://n-api-gamma.vercel.app/sheet/F3/update?verbose=true`
- **Method**: PATCH
- **Sử dụng trong**: `src/services/api.js` → `updateBatch()`

#### d) Detail reports (MKT)
- **URL**: `https://lumidataapi.vercel.app/detail_reports`
- **Sử dụng trong**: `src/pages/BaoCaoHieuSuatKPI.jsx`, `viewNsMoiNhanh.html`

---

## 4. Local Development (Commented out)

```javascript
// const LOCAL_HOST = 'http://localhost:8081';
```

---

## Tóm tắt theo file:

### `src/services/api.js`
- `https://n-api-gamma.vercel.app` - API endpoints cho F3 (sheet)

### `src/pages/BaoCaoChiTiet.jsx`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Báo_cáo_MKT.json`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nhân_sự.json`

### `src/pages/Profile.jsx`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Tài_khoản.json`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/users/{userId}.json`

### `src/pages/ChangeLogViewer.jsx`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/ChangeLog.json`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/f3_data/{orderId}.json`

### `src/pages/BaoCaoHieuSuatKPI.jsx`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json`
- `https://lumidataapi.vercel.app/detail_reports`

### `src/pages/ReportForm.jsx`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Báo_cáo_MKT.json`

### `src/pages/BaoCaoMarketing.jsx`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Báo_cáo_MKT.json`

### `src/hooks/useReportData.js`
- Sử dụng Firebase SDK với database: `report-55c9f-default-rtdb`
- Path: `detail_reports`

### `src/hooks/useF3Data.js`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/F3.json`
- `https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Tài_khoản.json`

### `src/firebase/config.js`
- Firebase project: `report-55c9f`
- Database URL: `https://report-55c9f-default-rtdb.asia-southeast1.firebasedatabase.app`

---

## Lưu ý:
1. Có 2 Firebase projects đang được sử dụng:
   - `lumi-6dff7` - Sử dụng REST API
   - `report-55c9f` - Sử dụng Firebase SDK

2. API Server chính: `n-api-gamma.vercel.app` - Xử lý các thao tác với Google Sheets (F3)

3. Tất cả các URL đều là production URLs, không có local development URLs đang được sử dụng.








