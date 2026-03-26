const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'products'
    `);
    console.log('PRODUCTS COLUMNS:');
    res.rows.forEach(r => console.log(r.column_name));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    pool.end();
  }
}
run();
