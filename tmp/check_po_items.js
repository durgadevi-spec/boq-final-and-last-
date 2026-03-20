import "dotenv/config";
import pkg from 'pg';
import fs from 'fs';
const { Client } = pkg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function check() {
  try {
    await client.connect();
    console.log("Connected to DB");
    
    const res = await client.query(`
      SELECT poi.id, poi.po_id, po.po_number, poi.material_id, poi.item, poi.qty, poi.original_qty, poi.qty_modified, poi.is_synced, po.status
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.id
      WHERE poi.qty_modified = true
      ORDER BY poi.id DESC
      LIMIT 10
    `);
    
    fs.writeFileSync('c:\\Users\\Hello\\Documents\\BOQ\\BOQ-last-main\\BOQ-last-main\\tmp\\po_items_debug.json', JSON.stringify(res.rows, null, 2));
    console.log("Results written to po_items_debug.json");
    
    await client.end();
  } catch (err) {
    console.error("Error checking DB:", err);
    process.exit(1);
  }
}

check();
