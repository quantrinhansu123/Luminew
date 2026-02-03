-- Migration: Drop unused columns from lead_sources table
-- Description: Remove api_key and webhook_url columns as they are not needed
-- Author: System
-- Date: 2026-01-12

-- Drop api_key and webhook_url columns from lead_sources table
ALTER TABLE public.lead_sources
DROP COLUMN IF EXISTS api_key,
DROP COLUMN IF EXISTS webhook_url;

-- Verify the changes
-- Run this to check the table structure after migration:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'lead_sources'
-- ORDER BY ordinal_position;
