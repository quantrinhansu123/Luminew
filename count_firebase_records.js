const https = require('https');

const url = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_sale.json";

console.log("Fetching data from:", url);

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            let count = 0;
            if (Array.isArray(json)) {
                count = json.length;
                console.log(`Format: Array. Count: ${count}`);
            } else if (json && typeof json === 'object') {
                count = Object.keys(json).length;
                console.log(`Format: Object. Count: ${count}`);
            } else {
                console.log("Unknown format or empty.");
            }

            // Optional: Log a few field names to confirm structure if needed
            // console.log("Keys:", Object.keys(json).slice(0, 5));

        } catch (e) {
            console.error("Error parsing JSON:", e.message);
        }
    });

}).on("error", (err) => {
    console.error("Error fetching data:", err.message);
});
