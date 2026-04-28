
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const csvFilePath = '/home/nhatbang/freeland/Luminew/backup_20260413_104222/orders_rows.csv';
const outputFilePath = '/home/nhatbang/freeland/Luminew/backup_20260413_104222/orders_rows_today.csv';
const targetDate = '2026-04-14';

async function filterCsv() {
  const fileStream = fs.createReadStream(csvFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const outputStream = fs.createWriteStream(outputFilePath);
  let isHeader = true;
  let header = '';
  let count = 0;

  for await (const line of rl) {
    if (isHeader) {
      header = line;
      outputStream.write(line + '\n');
      isHeader = false;
      continue;
    }

    // A simple regex to find updated_at which is the 27th column
    // However, CSVs with quotes are tricky. 
    // Let's use a more robust way to split or just check if the line contains the date
    // and then verify the column.
    
    // For a quick script, let's try a regex that matches the date format in the expected position
    // Since updated_at is towards the middle/end, we can split by comma but be careful of quotes.
    
    const parts = parseCsvLine(line);
    const updatedAt = parts[26]; // 27th column is index 26

    if (updatedAt && updatedAt.startsWith(targetDate)) {
      outputStream.write(line + '\n');
      count++;
    }
  }

  outputStream.end();
  console.log(`Filtered ${count} rows to ${outputFilePath}`);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

filterCsv();
