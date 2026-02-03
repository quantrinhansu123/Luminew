-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Create Change Logs Table
create table if not exists change_logs (
    id uuid primary key default uuid_generate_v4(),
    user_email text,
    action text, -- 'UPDATE', 'INSERT', 'DELETE', 'SNAPSHOT'
    table_name text,
    record_id text,
    field text,
    old_value text,
    new_value text,
    details jsonb, -- Extra details if needed
    created_at timestamptz default now()
);

-- 2. Create Detail Reports Snapshot Table (Replica of detail_reports)
-- We check if it exists, if not create it with same structure as detail_reports
-- Note: In a real migration, we might want to drop and recreate, or truncate.
-- dealing with 'create table as' if it already exists is tricky in simple SQL script without procedural code, 
-- but 'create table if not exists' works for basic setup.
create table if not exists detail_reports_view_copy (like detail_reports including all);

-- Add a snapshot_timestamp column to track when this data was frozen
alter table detail_reports_view_copy 
add column if not exists snapshot_timestamp timestamptz default now();

-- 3. Create F3 Data Snapshot Table
create table if not exists f3_data_snapshot (
    id text primary key, -- Can be Order ID
    order_code text,
    raw_data jsonb,
    snapshot_timestamp timestamptz default now()
);

-- Policies
alter table change_logs enable row level security;
create policy "Enable all access for authenticated users" on change_logs for all using (true);

alter table detail_reports_view_copy enable row level security;
create policy "Enable all access for authenticated users" on detail_reports_view_copy for all using (true);

alter table f3_data_snapshot enable row level security;
create policy "Enable all access for authenticated users" on f3_data_snapshot for all using (true);
