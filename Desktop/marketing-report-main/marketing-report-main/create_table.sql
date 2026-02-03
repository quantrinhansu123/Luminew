-- 1. Create the table
create table if not exists marketing_pages (
    id text primary key,
    page_name text,
    mkt_staff text,
    product text,
    market text,
    pancake_id text,
    page_link text,
    created_at timestamptz default now()
);

-- 2. Enable simple security (RLS)
alter table marketing_pages enable row level security;
create policy "Public Access" on marketing_pages for all using (true) with check (true);
