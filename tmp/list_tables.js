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
    
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    fs.writeFileSync('c:\\Users\\Hello\\Documents\\BOQ\\BOQ-last-main\\BOQ-last-main\\tmp\\tables_debug.json', JSON.stringify(res.rows, null, 2));
    console.log("Results written to tables_debug.json");
    
    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

check();
