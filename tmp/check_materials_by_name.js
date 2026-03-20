import "dotenv/config";
import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    await client.connect();
    
    const names = ['testing demo', 'xyz item -testing'];
    const res = await client.query(`
      SELECT id, name, category, subcategory, unit
      FROM materials
      WHERE name = ANY($1)
    `, [names]);
    
    fs.writeFileSync('c:\\Users\\Hello\\Documents\\BOQ\\BOQ-last-main\\BOQ-last-main\\tmp\\materials_lookup_debug.json', JSON.stringify(res.rows, null, 2));
    console.log("Results written to materials_lookup_debug.json");
    
    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

check();
