-- Add 'team' column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS team text;

-- Optional: Add comment
COMMENT ON COLUMN users.team IS 'Team/Group assignment for the user (e.g. Sale 1, MKT 2)';
