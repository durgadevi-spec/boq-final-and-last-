const { query } = require('./server/db/client.js');
async function check() {
  try {
    const res = await query('SELECT count(*) FROM materials');
    console.log('Materials count:', res.rows[0].count);
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables:', tables.rows.map(r => r.table_name));
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
}
check();