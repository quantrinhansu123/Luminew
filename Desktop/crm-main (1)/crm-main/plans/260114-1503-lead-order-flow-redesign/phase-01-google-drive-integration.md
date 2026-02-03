# Phase 1: Google Drive Integration

## Priority: High | Status: Pending

## Overview
Setup Google Drive API with Service Account for file upload/download/thumbnail.

## Requirements
- Upload files to Google Drive
- Get thumbnail URLs for preview
- List files in folder
- Delete files
- Create order-specific folders

## Architecture

### Backend Module Structure
```
apps/api/src/modules/google-drive/
├── google-drive.module.ts
├── google-drive.service.ts
├── google-drive.controller.ts
└── dto/
    ├── upload-file.dto.ts
    └── file-response.dto.ts
```

### Environment Variables
```env
# apps/api/.env
GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
GOOGLE_DRIVE_ROOT_FOLDER_ID=1abc123xyz
```

## Database Changes

```sql
-- Add to design_files table
ALTER TABLE design_files
  ADD COLUMN google_drive_id TEXT,
  ADD COLUMN thumbnail_url TEXT,
  ADD COLUMN file_category VARCHAR(20) DEFAULT 'request';

-- Add to orders table
ALTER TABLE orders
  ADD COLUMN google_drive_folder_id TEXT;
```

### Prisma Schema Updates
```prisma
model design_files {
  // ... existing fields
  google_drive_id  String?  @db.Text
  thumbnail_url    String?  @db.Text
  file_category    String?  @default("request") @db.VarChar(20)
}

model orders {
  // ... existing fields
  google_drive_folder_id String? @db.Text
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/google-drive/upload` | Upload file to Drive |
| GET | `/api/google-drive/files/:folderId` | List files in folder |
| DELETE | `/api/google-drive/files/:fileId` | Delete file |
| POST | `/api/google-drive/folders` | Create new folder |

## Implementation Steps

### Backend
- [ ] Install googleapis package: `pnpm add googleapis`
- [ ] Create google-drive module
- [ ] Implement GoogleDriveService with:
  - `uploadFile(file, folderId)` → returns fileId, thumbnailUrl
  - `listFiles(folderId)` → returns file list
  - `deleteFile(fileId)` → void
  - `createFolder(name, parentId)` → returns folderId
  - `getThumbnailUrl(fileId, size)` → returns URL
- [ ] Create controller with endpoints
- [ ] Update Prisma schema
- [ ] Run migration

### Frontend
- [ ] Create `lib/google-drive-api.ts` with fetch wrappers
- [ ] Update upload components to use new API

## Thumbnail URL Format
```
https://drive.google.com/thumbnail?id={fileId}&sz=w{width}
```

## File Structure in Google Drive
```
📁 CRM-Designs (root folder - GOOGLE_DRIVE_ROOT_FOLDER_ID)
├── 📁 ORD-2026-001/
│   ├── 📁 requests/
│   └── 📁 results/
├── 📁 ORD-2026-002/
│   └── ...
```

## Success Criteria
- [ ] Files upload successfully to Google Drive
- [ ] Thumbnails display in UI
- [ ] Files organized by order code
- [ ] Delete works correctly

## Security
- Service Account key stored in env, not committed
- Validate file types before upload
- Size limit: 50MB per file
