-- Script: Clear all CSKH column data
-- Run this in Supabase SQL Editor
-- This will set all CSKH values to NULL

UPDATE orders 
SET cskh = NULL
WHERE cskh IS NOT NULL;

-- Verify the update
-- SELECT COUNT(*) as total_orders, 
--        COUNT(cskh) as orders_with_cskh,
--        COUNT(*) - COUNT(cskh) as orders_without_cskh
-- FROM orders;
