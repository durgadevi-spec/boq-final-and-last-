import { pool } from "./server/db/client";

async function run() {
  const productId = "Marble Replacement"; // A non-UUID string
  
  try {
    console.log("Testing step3_config query...");
    const step3Result = await pool.query(
      `SELECT s.*, 'draft' as status FROM product_step3_config s
       WHERE s.product_id = $1 OR s.product_name = $2
       ORDER BY s.updated_at DESC`,
      [productId, productId]
    );
    console.log("step3_config success. Rows:", step3Result.rows.length);

    console.log("\\nTesting step11_products query...");
    const step11Result = await pool.query(
      `SELECT s.*, 'approved' as status FROM step11_products s
       WHERE s.product_id = $1 OR s.product_name = $2
       ORDER BY s.updated_at DESC`,
      [productId, productId]
    );
    console.log("step11_products success. Rows:", step11Result.rows.length);
    
  } catch (e) {
    console.error("Query failed:", e.message);
  } finally {
    await pool.end();
  }
}

run();
