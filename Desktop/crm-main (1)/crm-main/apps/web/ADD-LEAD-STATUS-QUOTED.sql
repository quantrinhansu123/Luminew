-- Add new lead status value: quoted (Đã báo giá)
-- Run in Supabase SQL Editor ONLY if updating lead status to 'quoted' fails.

do $$
begin
  -- If leads.status is an enum type named lead_status, add value.
  begin
    execute 'alter type public.lead_status add value if not exists ''quoted''';
  exception
    when undefined_object then
      null;
    when others then
      null;
  end;
end $$;

