import fs from 'fs';
import https from 'https';

const url = 'https://docs.google.com/spreadsheets/d/1BcAy4tDbHVge81HsMRCy097H3v8dvRddJJnWPX9Kprc/export?format=csv&gid=0';
const dest = 'temp_pages.csv';

function download(url, dest) {
    https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log(`Redirecting to ${res.headers.location}`);
            return download(res.headers.location, dest);
        }

        if (res.statusCode !== 200) {
            console.error(`Failed to download: ${res.statusCode}`);
            res.resume();
            return;
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);

        file.on('finish', () => {
            file.close(() => {
                console.log('Download completed.');
            });
        });
    }).on('error', (err) => {
        console.error(`Error: ${err.message}`);
    });
}

download(url, dest);
