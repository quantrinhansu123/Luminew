-- =====================================================
-- SQL Script to Optimize Orders Table
-- Includes Indexes and Partitions for Maximum Performance
-- =====================================================

-- =====================================================
-- 1. CREATE INDEXES FOR FILTER COLUMNS
-- =====================================================

-- Primary index on order_date (most common filter, supports range queries)
-- Using BTREE for range queries and sorting
CREATE INDEX IF NOT EXISTS idx_orders_order_date_btree 
ON orders (order_date DESC NULLS LAST);

-- Composite index for date range queries with team (common combination)
CREATE INDEX IF NOT EXISTS idx_orders_order_date_team 
ON orders (order_date DESC, team) 
WHERE order_date IS NOT NULL;

-- Index on total_amount_vnd for amount range queries
CREATE INDEX IF NOT EXISTS idx_orders_total_amount_vnd 
ON orders (total_amount_vnd DESC NULLS LAST);

-- Index on country (exact match, high cardinality)
CREATE INDEX IF NOT EXISTS idx_orders_country 
ON orders (country) 
WHERE country IS NOT NULL;

-- Index on product (exact match, high cardinality)
CREATE INDEX IF NOT EXISTS idx_orders_product 
ON orders (product) 
WHERE product IS NOT NULL;

-- Index on tracking_code (exact match, unique lookups)
CREATE INDEX IF NOT EXISTS idx_orders_tracking_code 
ON orders (tracking_code) 
WHERE tracking_code IS NOT NULL;

-- Index on marketing_staff (exact match)
CREATE INDEX IF NOT EXISTS idx_orders_marketing_staff 
ON orders (marketing_staff) 
WHERE marketing_staff IS NOT NULL;

-- Index on sale_staff (exact match)
CREATE INDEX IF NOT EXISTS idx_orders_sale_staff 
ON orders (sale_staff) 
WHERE sale_staff IS NOT NULL;

-- Index on team (exact match, low cardinality but frequent filter)
CREATE INDEX IF NOT EXISTS idx_orders_team 
ON orders (team) 
WHERE team IS NOT NULL;

-- =====================================================
-- 2. COMPOSITE INDEXES FOR COMMON QUERY PATTERNS
-- =====================================================

-- Composite index for date + amount range queries
CREATE INDEX IF NOT EXISTS idx_orders_date_amount 
ON orders (order_date DESC, total_amount_vnd DESC) 
WHERE order_date IS NOT NULL AND total_amount_vnd IS NOT NULL;

-- Composite index for team + date (very common combination)
CREATE INDEX IF NOT EXISTS idx_orders_team_date 
ON orders (team, order_date DESC) 
WHERE team IS NOT NULL AND order_date IS NOT NULL;

-- Composite index for country + date
CREATE INDEX IF NOT EXISTS idx_orders_country_date 
ON orders (country, order_date DESC) 
WHERE country IS NOT NULL AND order_date IS NOT NULL;

-- Composite index for product + date
CREATE INDEX IF NOT EXISTS idx_orders_product_date 
ON orders (product, order_date DESC) 
WHERE product IS NOT NULL AND order_date IS NOT NULL;

-- Composite index for staff + date queries
CREATE INDEX IF NOT EXISTS idx_orders_marketing_staff_date 
ON orders (marketing_staff, order_date DESC) 
WHERE marketing_staff IS NOT NULL AND order_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sale_staff_date 
ON orders (sale_staff, order_date DESC) 
WHERE sale_staff IS NOT NULL AND order_date IS NOT NULL;

-- =====================================================
-- 3. PARTITIONING BY ORDER_DATE (MONTHLY PARTITIONS)
-- =====================================================

-- Note: Partitioning requires the table to be partitioned first
-- This is a setup script - run this BEFORE creating the main table if starting fresh
-- OR convert existing table to partitioned table

-- Step 1: Create partitioned table structure (if starting fresh)
/*
CREATE TABLE orders_partitioned (
    order_date DATE,
    total_amount_vnd NUMERIC(15,2),
    country VARCHAR(100),
    product VARCHAR(255),
    tracking_code VARCHAR(100),
    marketing_staff VARCHAR(100),
    sale_staff VARCHAR(100),
    team VARCHAR(50),
    -- Add other columns as needed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (order_date);

-- Step 2: Create monthly partitions (example for 2024-2026)
CREATE TABLE orders_2024_01 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE orders_2024_02 PARTITION OF orders_partitioned
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- ... continue for all months

-- Step 3: Create default partition for future dates
CREATE TABLE orders_default PARTITION OF orders_partitioned
    DEFAULT;
*/

-- =====================================================
-- 4. ALTERNATIVE: TABLE PARTITIONING FOR EXISTING TABLE
-- =====================================================

-- If table already exists, you can use PostgreSQL's table inheritance
-- or create a new partitioned table and migrate data

-- Option A: Create monthly partition tables manually (if not using native partitioning)
-- This approach uses table inheritance

/*
-- Create parent table (if not exists)
CREATE TABLE IF NOT EXISTS orders_parent (
    LIKE orders INCLUDING ALL
);

-- Create monthly partition tables
CREATE TABLE orders_2024_01 (LIKE orders_parent INCLUDING ALL)
    INHERITS (orders_parent);

CREATE TABLE orders_2024_02 (LIKE orders_parent INCLUDING ALL)
    INHERITS (orders_parent);

-- Add check constraints for partition pruning
ALTER TABLE orders_2024_01 
    ADD CONSTRAINT orders_2024_01_date_check 
    CHECK (order_date >= '2024-01-01' AND order_date < '2024-02-01');

ALTER TABLE orders_2024_02 
    ADD CONSTRAINT orders_2024_02_date_check 
    CHECK (order_date >= '2024-02-01' AND order_date < '2024-03-01');

-- Create indexes on each partition
CREATE INDEX idx_orders_2024_01_order_date ON orders_2024_01 (order_date DESC);
CREATE INDEX idx_orders_2024_02_order_date ON orders_2024_02 (order_date DESC);
-- ... repeat for all partitions
*/

-- =====================================================
-- 5. STATISTICS AND ANALYZE
-- =====================================================

-- Update table statistics for query planner
ANALYZE orders;

-- Set statistics target for better query planning
ALTER TABLE orders ALTER COLUMN order_date SET STATISTICS 1000;
ALTER TABLE orders ALTER COLUMN total_amount_vnd SET STATISTICS 1000;
ALTER TABLE orders ALTER COLUMN country SET STATISTICS 500;
ALTER TABLE orders ALTER COLUMN product SET STATISTICS 500;
ALTER TABLE orders ALTER COLUMN team SET STATISTICS 100;

-- =====================================================
-- 6. QUERY OPTIMIZATION SETTINGS
-- =====================================================

-- Enable parallel queries (if supported by your PostgreSQL version)
-- ALTER TABLE orders SET (parallel_workers = 4);

-- =====================================================
-- 7. MAINTENANCE SCRIPTS
-- =====================================================

-- Function to create monthly partition (run monthly)
/*
CREATE OR REPLACE FUNCTION create_monthly_partition(year_month DATE)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := DATE_TRUNC('month', year_month);
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'orders_' || TO_CHAR(start_date, 'YYYY_MM');
    
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I PARTITION OF orders_partitioned
        FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
    
    -- Create indexes on new partition
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (order_date DESC)',
        'idx_' || partition_name || '_order_date', partition_name);
END;
$$ LANGUAGE plpgsql;
*/

-- =====================================================
-- 8. MONITORING QUERIES
-- =====================================================

-- Check index usage
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'orders'
ORDER BY idx_scan DESC;
*/

-- Check table size and index size
/*
SELECT 
    pg_size_pretty(pg_total_relation_size('orders')) as total_size,
    pg_size_pretty(pg_relation_size('orders')) as table_size,
    pg_size_pretty(pg_total_relation_size('orders') - pg_relation_size('orders')) as indexes_size;
*/

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. Run ANALYZE after creating indexes
-- 2. Monitor index usage and remove unused indexes
-- 3. Consider partitioning if table has millions of rows
-- 4. Adjust statistics targets based on data distribution
-- 5. Use EXPLAIN ANALYZE to verify query plans use indexes
-- =====================================================
