const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  try {
    const res = await pool.query(`
        SELECT spi.*, 
               COALESCE(m.category, p.subcategory, mt.category) AS category
        FROM sketch_plan_items spi
        LEFT JOIN materials m ON spi.material_id = m.id::text
        LEFT JOIN products p ON spi.material_id = p.id::text
        LEFT JOIN material_templates mt ON spi.material_id = mt.id::text
        WHERE spi.plan_id = 'test' 
        ORDER BY spi.created_at ASC, spi.id ASC
    `);
    console.log(res.rows);
  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}
run();
