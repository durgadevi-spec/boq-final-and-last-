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
    
    const ids = [
      '6614f6a5-f595-462f-94ab-3d6c438e47e3',
      '1a3cf627-19f3-4bc6-8b9d-11039f0a11a2',
      'a2071c31-7daa-4dbb-bf8b-beaf2d46ce40',
      'd0886cdd-41e2-4d94-b2ad-d915b20e1beb'
    ];
    const res = await client.query(`
      SELECT id, item_name, material_id FROM purchase_order_requests_items WHERE id = ANY($1)
    `, [ids]);
    
    fs.writeFileSync('c:\\Users\\Hello\\Documents\\BOQ\\BOQ-last-main\\BOQ-last-main\\tmp\\request_items_debug.json', JSON.stringify(res.rows, null, 2));
    console.log("Results written to request_items_debug.json");
    
    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

check();
