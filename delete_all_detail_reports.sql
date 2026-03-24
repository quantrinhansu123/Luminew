-- Xoa toan bo du lieu bang detail_reports
-- Can nhac ky truoc khi chay tren production

BEGIN;

TRUNCATE TABLE detail_reports RESTART IDENTITY;

COMMIT;
