const https = require('https');

// Use limitToFirst=1 to get just the first item. 
// Firebase REST API supports this.
const url = "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/B%C3%A1o_c%C3%A1o_sale.json?orderBy=\"$key\"&limitToFirst=1";

console.log("Fetching single record from:", url);

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            console.log("Raw Response:", data);
            const json = JSON.parse(data);

            // It usually returns an object with one key { "KEY": { ...data... } } 
            // or an array with one item [null, { ...data... }] if sparse

            let item = null;
            if (Array.isArray(json)) {
                item = json.find(x => x !== null);
            } else if (typeof json === 'object' && json !== null) {
                const keys = Object.keys(json);
                if (keys.length > 0) {
                    const firstKey = keys[0];
                    item = json[firstKey];
                    // Also check if the KEY itself is the ID
                    console.log("Record Key (Firebase ID):", firstKey);

                    // Check internal fields
                    if (item) {
                        console.log("Fields inside record:");
                        Object.keys(item).forEach(k => console.log(` - ${k}: ${item[k]}`));
                    }
                }
            }

        } catch (e) {
            console.error("Error parsing JSON:", e.message);
        }
    });

}).on("error", (err) => {
    console.error("Error fetching data:", err.message);
});
