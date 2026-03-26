const { query } = require('./server/db/client');

async function verify() {
  try {
    const res = await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'material_templates'");
    console.log('COLUMNS:', res.rows.map(r => r.column_name).sort().join(', '));
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}

verify();
