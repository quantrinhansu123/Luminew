const https = require('https');

const url = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_sale.json";

console.log("Fetching sample data from:", url);

https.get(url, (res) => {
    let data = '';
    const MAX_SIZE = 10000; // Just get enough for first few items

    res.on('data', (chunk) => {
        data += chunk;
        if (data.length > MAX_SIZE) {
            res.destroy(); // Stop fetching
            processData(data);
        }
    });

    res.on('end', () => {
        if (data.length <= MAX_SIZE) processData(data);
    });

}).on("error", (err) => {
    console.error("Error:", err.message);
});

function processData(raw) {
    // Attempt to close JSON if cut off
    let json = null;
    try {
        // Try parsing assuming it's complete or find the first closing bracket of first item
        // If Object: {"KEY": { ... }}
        // If Array: [{ ... }]

        // Let's just look at the string structure first
        const firstChar = raw.trim()[0];
        console.log(`Structure starts with: ${firstChar} (Object='{', Array='[')`);

        if (firstChar === '{') {
            // It's likely an object with keys
            // Regex to find first Key
            const match = raw.match(/"([^"]+)":\s*\{/);
            if (match) {
                console.log(`Found Key (ID): ${match[1]}`);
            }
        }

        // Let's try to extract one full item
        const openBrace = raw.indexOf('{', 1); // Start of first item (if array) or start of content (if object)
        const closeBrace = raw.indexOf('}', openBrace);

        if (openBrace > -1 && closeBrace > -1) {
            const itemStr = raw.substring(openBrace, closeBrace + 1);
            try {
                const item = JSON.parse(itemStr);
                console.log("First Item Keys:", Object.keys(item));
                console.log("First Item Preview:", JSON.stringify(item, null, 2));
            } catch (e) {
                console.log("Could not parse first item snippet.");
                console.log("Snippet:", itemStr);
            }
        }

    } catch (e) {
        console.error("Processing Error:", e);
    }
}
