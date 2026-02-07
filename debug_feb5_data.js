
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    fs.writeFileSync('output_debug_feb5.txt', "Missing env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    let output = "Debugging Data for 2026-02-05 (Mùng 5)\n=====================================\n";
    const dateToCheck = '2026-02-05';

    // 1. Get Orders on that date
    output += `\n[ORDERS] Fetching orders for ${dateToCheck}...\n`;
    const { data: orders, error: oError } = await supabase
        .from('orders')
        .select('sale_staff, order_code, total_amount_vnd, product')
        .eq('order_date', dateToCheck);

    if (oError) {
        output += "Error fetching orders: " + JSON.stringify(oError) + "\n";
    } else {
        output += `Found ${orders.length} orders.\n`;
        // Group by Sale Staff to see who has orders
        const ordersBySale = {};
        orders.forEach(o => {
            const name = (o.sale_staff || "UNKNOWN").trim().toLowerCase().replace(/\s+/g, ' ');
            if (!ordersBySale[name]) ordersBySale[name] = 0;
            ordersBySale[name]++;
        });
        output += "Orders count by Sale Staff (Normalized):\n";
        for (const [name, count] of Object.entries(ordersBySale)) {
            output += `  - "${name}": ${count} orders\n`;
        }
    }

    // 2. Get Sales Reports on that date
    output += `\n[REPORTS] Fetching sales_reports for ${dateToCheck}...\n`;
    const { data: reports, error: rError } = await supabase
        .from('sales_reports')
        .select('name, date')
        .eq('date', dateToCheck);

    if (rError) {
        output += "Error fetching reports: " + JSON.stringify(rError) + "\n";
    } else {
        output += `Found ${reports.length} report entries.\n`;
        const reportsByName = new Set();
        reports.forEach(r => {
            const name = (r.name || "UNKNOWN").trim().toLowerCase().replace(/\s+/g, ' ');
            reportsByName.add(name);
        });

        output += "Sales Staff present in Reports:\n";
        Array.from(reportsByName).sort().forEach(name => {
            output += `  - "${name}"\n`;
        });

        // 3. Compare
        output += "\n[COMPARISON] Checking for Sales with Orders but NO Report:\n";
        if (orders) {
            const missingReporters = [];
            const ordersBySale = {}; // Rebuild map for this step
            orders.forEach(o => {
                const name = (o.sale_staff || "UNKNOWN").trim().toLowerCase().replace(/\s+/g, ' ');
                if (!ordersBySale[name]) ordersBySale[name] = 0;
                ordersBySale[name]++;
            });

            for (const [saleName, count] of Object.entries(ordersBySale)) {
                if (!reportsByName.has(saleName)) {
                    missingReporters.push({ name: saleName, orderCount: count });
                }
            }

            if (missingReporters.length > 0) {
                output += "⚠️ The following staff have orders but NO entry in sales_reports (Data will NOT show in current logic):\n";
                missingReporters.forEach(m => {
                    output += `  ❌ "${m.name}" has ${m.orderCount} orders but NO report entry.\n`;
                });
            } else {
                output += "✅ All staff with orders have at least one report entry.\n";
            }
        }
    }

    fs.writeFileSync('output_debug_feb5.txt', output);
    console.log("Done writing to output_debug_feb5.txt");
}

check();
