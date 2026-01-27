import fs from 'fs';

const inputFile = 'temp_pages.csv';
const outputFile = 'create_marketing_pages_full.sql';

try {
    if (!fs.existsSync(inputFile)) {
        console.error('Input file not found: ' + inputFile);
        process.exit(1);
    }
    const data = fs.readFileSync(inputFile, 'utf8');
    const lines = data.split(/\r?\n/);

    if (lines.length === 0) {
        console.error('File is empty');
        process.exit(1);
    }

    const sqlHeader = `-- Create marketing_pages table
create table if not exists marketing_pages (
    id text primary key,
    page_name text,
    mkt_staff text,
    product text,
    market text,
    pancake_id text,
    page_link text,
    created_at timestamptz default now()
);

-- Enable RLS
alter table marketing_pages enable row level security;
create policy "Enable all access for authenticated users" on marketing_pages for all using (true);

-- Seed Data
insert into marketing_pages (id, page_name, mkt_staff, product, market, pancake_id, page_link) values
`;

    let sqlValues = [];

    // Helper to escape single quotes
    const esc = (str) => {
        if (!str) return 'NULL';
        return `'${str.replace(/'/g, "''").trim()}'`;
    };

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple robust CSV parser for this specific format
        // Loop through characters, handle quotes
        let cols = [];
        let inQuote = false;
        let current = '';

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                if (inQuote && line[j + 1] === '"') {
                    current += '"';
                    j++; // Skip next quote
                } else {
                    inQuote = !inQuote;
                }
            } else if (char === ',' && !inQuote) {
                cols.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        cols.push(current);

        if (cols.length < 2) continue; // Skip malformed lines

        // Mapping based on observation: id, Tên Page, Tên MKT, Sản phẩm, Thị trường, ID PANCAKE, Link Page
        // Sometimes CSVs have extra or fewer columns depending on export
        // We try to grab indices carefully.

        const id = cols[0];
        const pageName = cols[1];
        const mktStaff = cols[2];
        const product = cols[3];
        const market = cols[4];
        const pancakeId = cols[5];
        const linkPage = cols[6];

        if (!id) continue;

        sqlValues.push(`(${esc(id)}, ${esc(pageName)}, ${esc(mktStaff)}, ${esc(product)}, ${esc(market)}, ${esc(pancakeId)}, ${esc(linkPage)})`);
    }

    const sqlFooter = `
on conflict (id) do update set
    page_name = EXCLUDED.page_name,
    mkt_staff = EXCLUDED.mkt_staff,
    product = EXCLUDED.product,
    market = EXCLUDED.market,
    pancake_id = EXCLUDED.pancake_id,
    page_link = EXCLUDED.page_link;
`;

    const finalSQL = sqlHeader + sqlValues.join(',\n') + sqlFooter;

    fs.writeFileSync(outputFile, finalSQL);
    console.log('Successfully created SQL file with ' + sqlValues.length + ' records.');

} catch (err) {
    console.error('Error:', err);
}
