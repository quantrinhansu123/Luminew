
const { isTeamAllowed, TEAM_MENU_CONFIG } = require('./src/config/teamMenuMapping.js');

const testCases = [
    { team: 'BP CSKH', key: 'cskh', expected: true },
    { team: 'CSKH Team', key: 'cskh', expected: true },
    { team: 'Sale Region 1', key: 'sale', expected: true },
    { team: 'Kinh doanh', key: 'sale', expected: true },
    { team: 'Vận đơn Hà Nội', key: 'delivery', expected: true },
    { team: 'Kho HN', key: 'delivery', expected: true },
    { team: 'Marketing Content', key: 'marketing', expected: true },
    { team: 'Truyền thông', key: 'marketing', expected: true },
    { team: 'R&D Lab', key: 'rnd', expected: true },
    { team: 'Ke toan', key: 'finance', expected: true }, // "Kế toán" vs "Ke toan" - might fail if no fuzzy match
    { team: 'Accounting', key: 'finance', expected: true },
    { team: 'HCNS', key: 'hr', expected: true },
    { team: 'Nhân sự', key: 'hr', expected: true },
    { team: 'User', key: 'cskh', expected: false },
    { team: '', key: 'cskh', expected: true }, // Empty team -> Allow all per code?
];

console.log("Running Logic Tests...");

testCases.forEach(({ team, key, expected }) => {
    const result = isTeamAllowed(team, [key]);
    const pass = result === expected;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] Team: "${team}" -> Key: ["${key}"] = ${result}`);
});

// Test empty role simulation
const userRole = 'cskh';
const keys = ['cskh'];
const roleMatch = keys.includes(userRole.toLowerCase());
console.log(`Role Match Check: 'cskh' in ['cskh']? ${roleMatch}`);
