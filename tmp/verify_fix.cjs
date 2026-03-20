const http = require('http');

async function check() {
  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/bom-approvals',
    method: 'GET',
    headers: {
       // Assuming no auth for local check or it's handled. 
       // Wait, I might need an auth token. 
       // I'll try to query the database directly instead to see if the query works as expected.
    }
  };
  
  // Actually, querying the DB with the NEW logic is safer and easier.
}

const { Client } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const client = new Client({
  connectionString: "postgresql://postgres.kfbquadkplnnqovsbnji:Durga%219Qx%407B%2325Lm@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  try {
    const query = "SELECT id, project_name, version_number, type, status, is_cleared FROM boq_versions WHERE status != 'draft' AND ((is_cleared IS FALSE OR is_cleared IS NULL) OR status = 'edit_requested') ORDER BY created_at DESC";
    const res = await client.query(query);
    const demoVersions = res.rows.filter(r => r.project_name.includes('demo'));
    console.log("Approvals for Project Demo:");
    console.log(JSON.stringify(demoVersions, null, 2));
    
    const v3 = demoVersions.find(v => v.version_number === 3);
    if (v3) {
      console.log("\nSUCCESS: V3 is found in the approval list!");
    } else {
      console.log("\nFAILURE: V3 is still missing.");
    }
  } finally {
    await client.end();
  }
}

run().catch(console.error);
