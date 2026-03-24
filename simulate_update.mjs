import { updateBatch } from './src/services/api.js';

async function run() {
    const rows = [
        {
            "Mã đơn hàng": "Kemcfbf4905",
            "Ngày đóng hàng": "20/03/2026"
        }
    ];
    
    try {
        const res = await updateBatch(rows, "Auto-Agent-Test");
        console.log("Result:", res);
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
