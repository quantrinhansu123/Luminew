-- Add 'leader_teams' column to users table
-- This column stores an array of teams that a Leader can manage
-- For PostgreSQL, we'll use JSONB or TEXT[] array type

-- Option 1: Using JSONB (more flexible, recommended)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS leader_teams JSONB DEFAULT '[]'::jsonb;

-- Option 2: Alternative using TEXT[] array (uncomment if preferred)
-- ALTER TABLE public.users 
-- ADD COLUMN IF NOT EXISTS leader_teams TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Add comment
COMMENT ON COLUMN public.users.leader_teams IS 'Array of teams that a Leader can manage (only applicable for Leader position)';

-- Optional: Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_users_leader_teams ON public.users USING GIN (leader_teams);

SELECT 'Added leader_teams column to users table' as message;
