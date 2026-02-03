# Lead-to-Order Flow Redesign with Google Drive Integration

## Overview
Redesign CRM workflow: Lead → Customer + Order creation only when lead is "closed". Integrate Google Drive for file storage and implement Design Gallery.

## Status: Completed

## Phases

| Phase | Description | Status | File | Completed |
|-------|-------------|--------|------|-----------|
| 1 | Google Drive Integration | Done | [phase-01-google-drive-integration.md](./phase-01-google-drive-integration.md) | 2026-01-14 |
| 2 | Lead → Customer + Order Flow | Done | [phase-02-lead-customer-order-flow.md](./phase-02-lead-customer-order-flow.md) | 2026-01-14 |
| 3 | Design Tasks Section | Done | [phase-03-design-tasks-section.md](./phase-03-design-tasks-section.md) | 2026-01-14 |
| 4 | Design Gallery (Kho Thiết Kế) | Done | [phase-04-design-gallery.md](./phase-04-design-gallery.md) | 2026-01-14 |
| 5 | UI Cleanup & Polish | Done | [phase-05-ui-cleanup.md](./phase-05-ui-cleanup.md) | 2026-01-14 |

## Key Decisions
- Google Drive: Service Account (shared company storage)
- Database: Minimal changes, add fields to existing tables
- Lead statuses: Keep current (new, calling, no_answer, closed, rejected)
- Design files: Use `design_files` table with `file_category` field

## Dependencies
- Google Cloud Project with Drive API enabled
- Service Account credentials (JSON key file)
- Shared folder ID in Google Drive
