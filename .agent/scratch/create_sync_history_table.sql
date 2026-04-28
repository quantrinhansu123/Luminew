CREATE TABLE IF NOT EXISTS sync_history_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    performed_by TEXT,
    sync_type TEXT,
    mode_label TEXT,
    total_input_rows INTEGER,
    unique_orders_count INTEGER,
    success_count INTEGER,
    missing_count INTEGER
);
