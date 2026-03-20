const { Client } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const client = new Client({
  connectionString: "postgresql://postgres.kfbquadkplnnqovsbnji:Durga%219Qx%407B%2325Lm@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  try {
    const res = await client.query("SELECT id, project_id, project_name, version_number, type, status, is_cleared FROM boq_versions WHERE project_name ILIKE '%demo%' ORDER BY version_number DESC");
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await client.end();
  }
}

run().catch(console.error);
