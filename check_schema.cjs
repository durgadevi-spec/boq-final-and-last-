const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sketch_plan_items'
    `);
    console.log('SKETCH_PLAN_ITEMS COLUMNS:', res.rows.map(r => r.column_name).join(', '));
    
    const res2 = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products'
    `);
    console.log('PRODUCTS COLUMNS:', res2.rows.map(r => r.column_name).join(', '));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    pool.end();
  }
}
run();
