const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkIds() {
  try {
    const result = await pool.query('SELECT batch_id, row_id FROM estimator_step9_cart LIMIT 5');
    console.log('Sample batch_id and row_id:');
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. batch_id: ${row.batch_id}, row_id: ${row.row_id}`);
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}    

checkIds();