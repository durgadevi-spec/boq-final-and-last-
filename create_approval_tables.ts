
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pg from "pg";

// Bypass self-signed cert error
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Load .env from root
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function createTables() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL not found in .env");
  }     
         
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes("supabase") ? { rejectUnauthorized: false } : false
  });

  console.log("Connecting to database...");
  const client = await pool.connect();

  try {
    console.log("Creating product_approvals table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        product_name TEXT NOT NULL,
        config_name TEXT,
        category_id TEXT,
        subcategory_id TEXT,
        total_cost DECIMAL(15, 2),
        required_unit_type TEXT,
        base_required_qty DECIMAL(15, 2),
        wastage_pct_default DECIMAL(15, 2),
        dim_a DECIMAL(15, 2),
        dim_b DECIMAL(15, 2),
        dim_c DECIMAL(15, 2),
        description TEXT,
        status TEXT DEFAULT 'pending', -- pending, approved, rejected
        created_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    console.log("Creating product_approval_items table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_approval_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        approval_id UUID NOT NULL REFERENCES product_approvals(id) ON DELETE CASCADE,
        material_id UUID,
        material_name TEXT,
        unit TEXT,
        qty DECIMAL(15, 2),
        rate DECIMAL(15, 2),
        supply_rate DECIMAL(15, 2),
        install_rate DECIMAL(15, 2),
        location TEXT,
        amount DECIMAL(15, 2),
        base_qty DECIMAL(15, 2),
        wastage_pct DECIMAL(15, 2),
        apply_wastage BOOLEAN,
        shop_name TEXT
      )
    `);
    
    console.log("Tables created successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

createTables().catch(err => {
  console.error("Error creating tables:", err);
  process.exit(1);
});
