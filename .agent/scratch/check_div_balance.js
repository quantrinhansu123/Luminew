const fs = require('fs');
const content = fs.readFileSync('/home/nhatbang/freeland/Luminew/src/pages/AdminTools.jsx', 'utf8');
const lines = content.split('\n');

let openDivs = 0;
let stack = [];

// Track activeTab === 'auto_assign' block
let inAutoAssign = false;
let startLine = 0;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (line.includes("activeTab === 'auto_assign' && (")) {
        inAutoAssign = true;
        startLine = lineNum;
        console.log(`Starting auto_assign at line ${lineNum}`);
    }

    if (inAutoAssign) {
        // Count <div and </div
        const opens = (line.match(/<div/g) || []).length;
        const closes = (line.match(/<\/div/g) || []).length;
        
        if (opens > 0 || closes > 0) {
            openDivs += opens - closes;
            console.log(`${lineNum}: ${line.trim()} | Open: ${opens}, Close: ${closes}, Total: ${openDivs}`);
        }

        if (line.includes(")}")) {
            // Check if this closes auto_assign
            if (openDivs <= 0) {
                console.log(`Ending auto_assign at line ${lineNum} with openDivs=${openDivs}`);
                inAutoAssign = false;
            }
        }
    }
}
