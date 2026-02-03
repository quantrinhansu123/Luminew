-- Remove the restrictive check constraint on user roles
-- This allows any string to be stored in 'role', supporting our new dynamic roles (marketing, sale, etc.)

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Optional: If we wanted to enforce it, we would add it back with all new roles, 
-- but for flexibility it's often better to rely on app logic or foreign key to app_roles.
-- For now, dropping it is the quick fix.
