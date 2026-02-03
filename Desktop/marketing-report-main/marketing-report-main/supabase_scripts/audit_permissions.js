import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function auditPermissions() {
    console.log('=== PERMISSION SYSTEM AUDIT ===\n');

    // 1. Check app_roles
    console.log('1. ROLES:');
    const { data: roles } = await supabase
        .from('app_roles')
        .select('*')
        .order('id');

    console.log(`Found ${roles?.length || 0} roles:`);
    roles?.forEach(r => console.log(`  - ${r.role_name} (ID: ${r.id})`));

    // 2. Check app_permissions  
    console.log('\n2. PERMISSIONS:');
    const { data: permissions } = await supabase
        .from('app_permissions')
        .select('*')
        .order('resource_name');

    console.log(`Found ${permissions?.length || 0} permissions:`);
    const byResource = {};
    permissions?.forEach(p => {
        if (!byResource[p.resource_name]) byResource[p.resource_name] = [];
        byResource[p.resource_name].push(p);
    });

    Object.keys(byResource).forEach(resource => {
        console.log(`  ${resource}:`);
        byResource[resource].forEach(p => {
            console.log(`    - ${p.action} (Role: ${p.role_id})`);
        });
    });

    // 3. Check app_page_permissions
    console.log('\n3. PAGE PERMISSIONS (app_page_permissions):');
    const { data: pagePerms } = await supabase
        .from('app_page_permissions')
        .select('*')
        .order('page_name');

    if (pagePerms && pagePerms.length > 0) {
        console.log(`Found ${pagePerms.length} page permissions:`);
        pagePerms.slice(0, 10).forEach(p => {
            console.log(`  - ${p.page_name}: role=${p.role_name}, can_view=${p.can_view}, can_edit=${p.can_edit}`);
        });
        if (pagePerms.length > 10) {
            console.log(`  ... and ${pagePerms.length - 10} more`);
        }
    } else {
        console.log('⚠️  No page permissions configured!');
    }

    // 4. Test permission check for 'marketing' role
    console.log('\n4. TESTING PERMISSION CHECK FOR MARKETING ROLE:');
    const testResources = ['CSKH_LIST', 'USER_MANAGEMENT', 'MODULE_ADMIN', 'MODULE_CSKH', 'MODULE_MKT'];

    for (const resource of testResources) {
        const { data: perm } = await supabase
            .from('app_page_permissions')
            .select('*')
            .eq('page_name', resource)
            .eq('role_name', 'marketing')
            .single();

        const status = perm && perm.can_view ? '✅ CAN VIEW' : '❌ CANNOT VIEW';
        console.log(`  ${resource}: ${status}`);
    }

    // Save report
    const report = {
        roles,
        permissions,
        pagePerms,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync('permission_audit_report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Full report saved to: permission_audit_report.json');
}

auditPermissions();
