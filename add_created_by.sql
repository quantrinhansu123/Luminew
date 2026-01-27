-- Add created_by column if it doesn't exist
alter table orders add column if not exists created_by text;

-- Also ensuring 'cskh' column exists just in case
alter table orders add column if not exists cskh text;
