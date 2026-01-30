-- Migration: Change shipping_fee from NUMERIC to TEXT
-- Run this in Supabase SQL Editor

-- Step 1: Alter column type from NUMERIC to TEXT directly
-- Using clause will automatically convert numeric values to text
ALTER TABLE orders 
ALTER COLUMN shipping_fee TYPE TEXT USING 
    CASE 
        WHEN shipping_fee IS NULL THEN NULL
        ELSE shipping_fee::text
    END;

-- Step 2: Add comment to document the change
COMMENT ON COLUMN orders.shipping_fee IS 'Phí ship nội địa Mỹ (usd) - TEXT format';
