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
    
    // Find the product "demo test"
    const pRes = await client.query("SELECT id, name FROM products WHERE name ILIKE '%demo test%' LIMIT 1");
    if (pRes.rows.length === 0) {
      console.log("Product not found");
      await client.end();
      return;
    }
    const product = pRes.rows[0];
    console.log("Found product:", product.name, product.id);

    // Get config items
    const cRes = await client.query(`
      SELECT psci.material_id, psci.material_name, psci.qty, psci.base_qty
      FROM product_step3_config psc
      JOIN product_step3_config_items psci ON psc.id = psci.step3_config_id
      WHERE psc.product_id = $1
      ORDER BY psc.updated_at DESC
      LIMIT 20
    `, [product.id]);
    
    fs.writeFileSync('c:\\Users\\Hello\\Documents\\BOQ\\BOQ-last-main\\BOQ-last-main\\tmp\\product_items_debug.json', JSON.stringify({ product, items: cRes.rows }, null, 2));
    console.log("Results written to product_items_debug.json");
    
    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

check();
