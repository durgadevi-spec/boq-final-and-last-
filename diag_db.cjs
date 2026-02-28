const fs = require('fs');
const { Pool } = require('pg');
const path = require('path');

async function run() {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const env = fs.readFileSync('.env', 'utf8');
    const dbUrlMatch = env.match(/DATABASE_URL=(.+)$/m);
    if (!dbUrlMatch) {
        console.error("No DATABASE_URL in .env");
        process.exit(1);
    }
    const dbUrl = dbUrlMatch[1].trim().replace(/^"|"$/g, '');
    const pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000
    });

    try {
        console.log("Querying products...");
        const prods = await pool.query("SELECT id, name FROM products WHERE name = 'demo test'");

        console.log("Querying step11_products...");
        const s11 = await pool.query("SELECT id, product_id, product_name, config_name, updated_at FROM step11_products WHERE product_name = 'demo test'");

        console.log("Querying product_step3_config...");
        const s3 = await pool.query("SELECT id, product_id, product_name, config_name, updated_at FROM product_step3_config WHERE product_name = 'demo test'");

        const result = {
            products: prods.rows,
            step11: s11.rows,
            step3: s3.rows
        };

        fs.writeFileSync('diag_results.json', JSON.stringify(result, null, 2));
        console.log("Done. Results in diag_results.json");
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

run();