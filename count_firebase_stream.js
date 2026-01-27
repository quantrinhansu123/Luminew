const https = require('https');

const url = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_sale.json";

console.log("Fetching stream from:", url);

https.get(url, (res) => {
    let count = 0;
    let buffer = '';
    const uniqueEmails = new Set();

    res.on('data', (chunk) => {
        buffer += chunk.toString();
        // Simple heuristic: Count occurrences of "Email" key which every record has
        // This is a rough estimation but much faster for huge files
        const matches = (buffer.match(/"Email"/g) || []).length;
        count += matches;

        // Remove processed part of buffer to save memory, keep last valid chunk for overlap
        // Keeping last 100 chars
        if (buffer.length > 100) {
            buffer = buffer.slice(-100);
        }
    });

    res.on('end', () => {
        console.log(`Estimated Record Count (based on "Email" keys): ${count}`);
    });

}).on("error", (err) => {
    console.error("Error fetching data:", err.message);
});
