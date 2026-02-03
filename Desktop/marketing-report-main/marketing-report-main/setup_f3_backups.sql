-- Database schema for F3 backup tracking
-- This table stores metadata about daily backups to Google Sheets

CREATE TABLE IF NOT EXISTS f3_backup_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backup_date DATE NOT NULL UNIQUE,
  sheet_name VARCHAR(255) NOT NULL,
  records_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'success',
  error_message TEXT,
  backup_trigger VARCHAR(100) DEFAULT 'cron',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_backup_history_date ON f3_backup_history(backup_date DESC);

COMMENT ON TABLE f3_backup_history IS 'Tracks daily F3 backup operations to Google Sheets';
COMMENT ON COLUMN f3_backup_history.backup_date IS 'Date of the data being backed up';
COMMENT ON COLUMN f3_backup_history.sheet_name IS 'Name of the Google Sheet created (e.g., F3_Backup_2026-01-19)';
COMMENT ON COLUMN f3_backup_history.records_count IS 'Number of records backed up';
COMMENT ON COLUMN f3_backup_history.status IS 'Status: success or failed';
COMMENT ON COLUMN f3_backup_history.backup_trigger IS 'How backup was triggered: cron or manual';
