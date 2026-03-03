import type { Express, Request, Response } from "express";
import fs from "fs";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { comparePasswords, generateToken } from "./auth";
import { authMiddleware, requireRole } from "./middleware";
import { randomUUID } from "crypto";
import { query } from "./db/client";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Helper to parse numeric values safely from strings (e.g. "₹ 1,500.00")
  const parseSafeNumeric = (val: any): number | null => {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === "number") return isNaN(val) ? null : val;

    try {
      // Remove currency symbols, commas, and other non-numeric chars except decimals
      const cleaned = String(val).replace(/[^0-9.-]/g, "");
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  };

  // Seed default material templates on startup (best-effort)
  try {
    // dynamic import to avoid circular deps during startup
    const { seedMaterialTemplates } = await import("./seed-templates");
    await seedMaterialTemplates();
  } catch (err: unknown) {
    console.warn(
      "[seed] Could not run material template seed:",
      (err as any)?.message || err,
    );
  }

  // Seed category and subcategory tables on startup
  try {
    const { seedMaterialCategories } = await import("./seed-categories");
    await seedMaterialCategories();
  } catch (err: unknown) {
    console.warn(
      "[seed] Could not run category seed:",
      (err as any)?.message || err,
    );
  }

  // One-time repair: link orphaned materials (template_id IS NULL) to matching templates
  try {
    const repairResult = await query(
      `UPDATE materials m
       SET template_id = t.id
       FROM material_templates t
       WHERE m.template_id IS NULL
         AND (LOWER(m.name) = LOWER(t.name) OR m.code = t.code)`
    );
    if (repairResult.rowCount && repairResult.rowCount > 0) {
      console.log(`[repair] Linked ${repairResult.rowCount} orphaned materials to their templates`);
    }
  } catch (err: unknown) {
    console.warn("[repair] Could not link orphaned materials:", (err as any)?.message || err);
  }

  // Ensure messages table exists (create if missing) to avoid runtime errors in dev
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_name TEXT NOT NULL,
        sender_email TEXT,
        sender_role TEXT,
        message TEXT NOT NULL,
        info TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMPTZ DEFAULT now(),
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_messages_sender_role ON messages (sender_role)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[migrations] ensure messages table failed (continuing):",
      (err as any)?.message || err,
    );
  }

  // Ensure alerts table exists (stores system alerts e.g. material rate edits)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        material_id VARCHAR(100),
        name TEXT,
        old_rate NUMERIC,
        new_rate NUMERIC,
        edited_by TEXT,
        shop_id VARCHAR(100),
        shop_name TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at)`);
  } catch (err: unknown) {
    console.warn('[migrations] ensure alerts table failed (continuing):', (err as any)?.message || err);
  }
  // Ensure alerts table has shop columns (for upgrades)
  try {
    await query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS shop_id VARCHAR(100)`);
    await query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS shop_name TEXT`);
  } catch (err: unknown) {
    console.warn('[migrations] ensure alerts shop columns failed (continuing):', (err as any)?.message || err);
  }

  // Alerts API endpoints (persisted in DB)
  // GET /api/alerts
  app.get('/api/alerts', async (_req, res) => {
    try {
      const result = await query(`SELECT id::text, type, material_id, name, old_rate, new_rate, edited_by, shop_id, shop_name, created_at FROM alerts ORDER BY created_at DESC LIMIT 200`);
      res.json({ alerts: result.rows });
    } catch (err) {
      console.error('/api/alerts GET error', err);
      res.status(500).json({ message: 'failed to load alerts' });
    }
  });

  // POST /api/alerts - create alert
  app.post('/api/alerts', authMiddleware, requireRole('admin', 'software_team', 'purchase_team'), async (req: Request, res: Response) => {
    try {
      const { type, materialId, name, oldRate, newRate, editedBy, shopId, shopName } = req.body || {};
      const id = randomUUID();
      const result = await query(`INSERT INTO alerts (id, type, material_id, name, old_rate, new_rate, edited_by, shop_id, shop_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING id::text, type, material_id, name, old_rate, new_rate, edited_by, shop_id, shop_name, created_at`, [id, type, materialId || null, name || null, oldRate || null, newRate || null, editedBy || null, shopId || null, shopName || null]);
      res.status(201).json({ alert: result.rows[0] });
    } catch (err) {
      console.error('/api/alerts POST error', err);
      res.status(500).json({ message: 'failed to create alert' });
    }
  });

  // DELETE /api/alerts - clear all
  app.delete('/api/alerts', authMiddleware, requireRole('admin', 'software_team'), async (_req, res) => {
    try {
      await query(`DELETE FROM alerts`);
      res.json({ message: 'alerts cleared' });
    } catch (err) {
      console.error('/api/alerts DELETE error', err);
      res.status(500).json({ message: 'failed to clear alerts' });
    }
  });

  // DELETE /api/alerts/:id - dismiss single alert
  app.delete('/api/alerts/:id', authMiddleware, requireRole('admin', 'software_team'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await query(`DELETE FROM alerts WHERE id = $1`, [id]);
      res.json({ message: 'alert dismissed' });
    } catch (err) {
      console.error('/api/alerts/:id DELETE error', err);
      res.status(500).json({ message: 'failed to delete alert' });
    }
  });

  // Ensure accumulated_products table exists
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS accumulated_products (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL,
        estimator_type VARCHAR(50) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_accumulated_products_user_estimator ON accumulated_products(user_id, estimator_type)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create accumulated_products table:",
      (err as any)?.message || err,
    );
  }

  // Ensure estimator tables exist
  try {
    // Create estimator_step9_cart table (Add to BOQ) - only if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS estimator_step9_cart (
        id SERIAL PRIMARY KEY,
        estimator VARCHAR(50) NOT NULL,
        bill_no VARCHAR(100) NOT NULL,
        s_no INTEGER,
        item VARCHAR(255),
        description TEXT,
        unit VARCHAR(50),
        qty DECIMAL,
        rate DECIMAL,
        amount DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create estimator_step11_finalize_boq table (Finalize BOQ) - only if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS estimator_step11_finalize_boq (
        id SERIAL PRIMARY KEY,
        estimator VARCHAR(50) NOT NULL,
        bill_no VARCHAR(100) NOT NULL,
        s_no INTEGER,
        item VARCHAR(255),
        location VARCHAR(255),
        description TEXT,
        unit VARCHAR(50),
        qty DECIMAL,
        supply_rate DECIMAL,
        install_rate DECIMAL,
        supply_amount DECIMAL,
        install_amount DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create estimator_step12_qa_boq table (QA BOQ) - only if it doesn't exist
    await query(`
      CREATE TABLE IF NOT EXISTS estimator_step12_qa_boq (
        id SERIAL PRIMARY KEY,
        estimator VARCHAR(50) NOT NULL,
        bill_no VARCHAR(100) NOT NULL,
        s_no INTEGER,
        item VARCHAR(255),
        location VARCHAR(255),
        description TEXT,
        unit VARCHAR(50),
        qty DECIMAL,
        supply_rate DECIMAL,
        install_rate DECIMAL,
        supply_amount DECIMAL,
        install_amount DECIMAL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step9_cart_bill_no ON estimator_step9_cart(bill_no)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step9_cart_estimator ON estimator_step9_cart(estimator)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step11_finalize_boq_bill_no ON estimator_step11_finalize_boq(bill_no)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step11_finalize_boq_estimator ON estimator_step11_finalize_boq(estimator)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step12_qa_boq_bill_no ON estimator_step12_qa_boq(bill_no)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_estimator_step12_qa_boq_estimator ON estimator_step12_qa_boq(estimator)`,
    );

    console.log(
      "[db] Estimator tables verified/created with correct structure",
    );
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create estimator tables:",
      (err as any)?.message || err,
    );
  }

  // Ensure material_submissions table has required columns
  try {
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(36)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP DEFAULT NOW()`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS finishtype VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS metaltype VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS product VARCHAR(255)`,
    );
    await query(
      `ALTER TABLE material_submissions ADD COLUMN IF NOT EXISTS category VARCHAR(255)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[migrations] ensure material_submissions columns failed (continuing):",
      (err as any)?.message || err,
    );
  }


  // Ensure shops table has vendor_category column
  try {
    await query(
      `ALTER TABLE shops ADD COLUMN IF NOT EXISTS vendor_category VARCHAR(255)`,
    );
  } catch (err: unknown) {
    console.warn(
      "[migrations] ensure shops vendor_category column failed (continuing):",
      (err as any)?.message || err,
    );
  }

  // Ensure boq_projects table exists (stores BOQ projects)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_projects (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        client VARCHAR(255),
        budget VARCHAR(100),
        location TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_projects_created_at ON boq_projects(created_at)`,
    );
    console.log("[db] boq_projects table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_projects table:",
      (err as any)?.message || err,
    );
  }
  try {
    await query(`ALTER TABLE boq_projects ADD COLUMN IF NOT EXISTS location TEXT`);
    await query(`ALTER TABLE boq_projects ADD COLUMN IF NOT EXISTS client_address TEXT`);
    await query(`ALTER TABLE boq_projects ADD COLUMN IF NOT EXISTS gst_no VARCHAR(100)`);
    await query(`ALTER TABLE boq_projects ADD COLUMN IF NOT EXISTS project_value VARCHAR(100)`);

    // Also on boq_versions for snapshots
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_client_address TEXT`);
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_gst_no VARCHAR(100)`);
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_value VARCHAR(100)`);
  } catch (err: unknown) {
    console.warn('[db] Could not update boq_projects/versions columns (continuing):', (err as any)?.message || err);
  }

  // Ensure boq_items table exists (stores BOQ line items captured from estimators)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_items (
        id VARCHAR(100) PRIMARY KEY,
        project_id VARCHAR(100) NOT NULL,
        estimator VARCHAR(50) NOT NULL,
        table_data JSONB,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES boq_projects(id) ON DELETE CASCADE
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_items_project_id ON boq_items(project_id)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_items_estimator ON boq_items(estimator)`,
    );
    console.log("[db] boq_items table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_items table:",
      (err as any)?.message || err,
    );
  }

  // Ensure boq_versions table exists (stores BOQ versions)
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_versions (
        id VARCHAR(100) PRIMARY KEY,
        project_id VARCHAR(100) NOT NULL,
        project_name VARCHAR(255),
        project_client VARCHAR(255),
        project_location TEXT,
        version_number INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'draft',
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (project_id) REFERENCES boq_projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, version_number)
      )
    `);
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_versions_project_id ON boq_versions(project_id)`,
    );
    await query(
      `CREATE INDEX IF NOT EXISTS idx_boq_versions_status ON boq_versions(status)`,
    );
    console.log("[db] boq_versions table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_versions table:",
      (err as any)?.message || err,
    );
  }

  // Ensure new columns exist on existing installations and populate them
  try {
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_name VARCHAR(255)`);
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_client VARCHAR(255)`);
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS project_location TEXT`);
    await query(`ALTER TABLE boq_versions ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);

    // Populate project_name, project_client and project_location from boq_projects where missing
    await query(`
      UPDATE boq_versions v
      SET project_name = p.name, project_client = p.client, project_location = p.location
      FROM boq_projects p
      WHERE v.project_id = p.id
        AND (v.project_name IS NULL OR v.project_client IS NULL OR v.project_location IS NULL)
    `);

    console.log("[db] boq_versions project_name and project_client populated");
  } catch (err: unknown) {
    console.warn("[db] Could not ensure/populate boq_versions project columns:", (err as any)?.message || err);
  }

  // Migrate boq_items to support version_id and sort_order
  try {
    await query(
      `ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS version_id VARCHAR(100)`,
    );
    await query(
      `ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`,
    );
    console.log("[db] boq_items version_id and sort_order columns ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not migrate boq_items columns:",
      (err as any)?.message || err,
    );
  }

  // Ensure boq_history table exists
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version_id VARCHAR(100) NOT NULL REFERENCES boq_versions(id) ON DELETE CASCADE,
        user_id VARCHAR(36) NOT NULL,
        user_full_name TEXT,
        action TEXT NOT NULL, 
        reason TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log("[db] boq_history table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_history table:",
      (err as any)?.message || err,
    );
  }

  // Add foreign key constraint (ignore error if it already exists)
  try {
    await query(
      `ALTER TABLE boq_items ADD CONSTRAINT fk_boq_items_version FOREIGN KEY (version_id) REFERENCES boq_versions(id) ON DELETE CASCADE`,
    );
    console.log("[db] boq_items foreign key constraint added");
  } catch (err: unknown) {
    // Constraint might already exist, which is fine
    const errorMsg = (err as any)?.message || "";
    if (!errorMsg.includes("already exists")) {
      console.warn("[db] Warning adding foreign key constraint:", errorMsg);
    }
  }

  // Ensure step11_products table has config_name column
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS step11_products (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        config_name VARCHAR(255) DEFAULT 'Default Configuration',
        category_id VARCHAR(255),
        subcategory_id VARCHAR(255),
        total_cost DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS step11_product_items (
        id SERIAL PRIMARY KEY,
        step11_product_id INTEGER REFERENCES step11_products(id) ON DELETE CASCADE,
        material_id VARCHAR(100),
        material_name VARCHAR(255),
        unit VARCHAR(50),
        qty DECIMAL(15,2),
        rate DECIMAL(15,2),
        supply_rate DECIMAL(15,2),
        install_rate DECIMAL(15,2),
        location VARCHAR(255),
        amount DECIMAL(15,4),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS config_name VARCHAR(255) DEFAULT 'Default Configuration'`);
    console.log("[db] step11_products and items tables ensured");
  } catch (err: unknown) {
    console.warn("[db] Could not ensure step11_products tables:", (err as any)?.message || err);
  }

  // Ensure Step 3 (configuration step) separate tables
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS product_step3_config (
        id SERIAL PRIMARY KEY,
        product_id VARCHAR(100) NOT NULL,
        product_name VARCHAR(255) NOT NULL,
        config_name VARCHAR(255) DEFAULT 'Default',
        category_id VARCHAR(255),
        subcategory_id VARCHAR(255),
        total_cost DECIMAL(15,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS product_step3_config_items (
        id SERIAL PRIMARY KEY,
        step3_config_id INTEGER REFERENCES product_step3_config(id) ON DELETE CASCADE,
        material_id VARCHAR(100),
        material_name VARCHAR(255),
        unit VARCHAR(50),
        qty DECIMAL(15,2),
        rate DECIMAL(15,2),
        supply_rate DECIMAL(15,2),
        install_rate DECIMAL(15,2),
        location VARCHAR(255),
        amount DECIMAL(15,4),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[db] product_step3_config tables ensured");

    // Add new BOQ architecture columns (safe, idempotent)
    await query(`ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS required_unit_type VARCHAR(20) DEFAULT 'Sqft'`);
    await query(`ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS base_required_qty DECIMAL(15,2) DEFAULT 1`);
    await query(`ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS wastage_pct_default DECIMAL(15,4) DEFAULT 0`);
    await query(`ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS base_qty DECIMAL(15,2)`);
    await query(`ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS wastage_pct DECIMAL(15,4)`);
    await query(`ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255)`);

    // Explicitly upgrade types if they already exist with old restrictive types
    await query(`ALTER TABLE product_step3_config ALTER COLUMN wastage_pct_default TYPE DECIMAL(15,4)`);
    await query(`ALTER TABLE product_step3_config_items ALTER COLUMN wastage_pct TYPE DECIMAL(15,4)`);

    console.log("[db] product_step3_config BOQ columns ensured and types upgraded");
  } catch (err: unknown) {
    console.warn("[db] Could not ensure product_step3_config tables:", (err as any)?.message || err);
  }

  // Ensure boq_items has a user_added flag (only items explicitly saved via Add Product)
  try {
    await query(
      `ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS user_added BOOLEAN DEFAULT true`,
    );
    console.log("[db] boq_items user_added column ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not ensure user_added column on boq_items:",
      (err as any)?.message || err,
    );
  }

  // Ensure material_templates table has vendor_category, tax_code_type, and tax_code_value columns
  try {
    await query(
      `ALTER TABLE material_templates ADD COLUMN IF NOT EXISTS vendor_category VARCHAR(255)`,
    );
    // Ensure column exists; then ensure the CHECK constraint allows NULL or the allowed values
    await query(`ALTER TABLE material_templates ADD COLUMN IF NOT EXISTS tax_code_type VARCHAR(10)`);
    // Drop old constraint if it exists (safely), then add a correct one that allows NULL
    try {
      await query(`ALTER TABLE material_templates DROP CONSTRAINT IF EXISTS material_templates_tax_code_type_check`);
    } catch (dropErr) {
      // ignore
    }
    await query(`ALTER TABLE material_templates ADD CONSTRAINT material_templates_tax_code_type_check CHECK (tax_code_type IS NULL OR tax_code_type IN ('hsn', 'sac'))`);
    await query(
      `ALTER TABLE material_templates ADD COLUMN IF NOT EXISTS tax_code_value VARCHAR(50)`,
    );
    await query(
      `ALTER TABLE material_templates ADD COLUMN IF NOT EXISTS technicalspecification TEXT`,
    );
    await query(
      `ALTER TABLE material_templates ADD COLUMN IF NOT EXISTS brandname VARCHAR(255)`,
    );
    console.log("[db] material_templates tax/vendor/techspec columns ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not ensure material_templates columns:",
      (err as any)?.message || err,
    );
  }

  // Ensure materials table has vendor_category, template_id, and optional tax columns
  try {
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS vendor_category VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS template_id UUID`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS tax_code_type VARCHAR(10)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS tax_code_value VARCHAR(50)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS technicalspecification TEXT`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS subcategory VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS product VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS dimensions VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS finishtype VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS metaltype VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS brandname VARCHAR(255)`);
    await query(`ALTER TABLE materials ADD COLUMN IF NOT EXISTS modelnumber VARCHAR(255)`);
    console.log("[db] materials vendor/template/tax/techspec/extra columns ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not ensure materials vendor/template/tax columns:",
      (err as any)?.message || err,
    );
  }

  // Create vendor_categories table for centralized vendor category management
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS vendor_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[db] vendor_categories table ensured");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create vendor_categories table:",
      (err as any)?.message || err,
    );
  }

  // Create boq_templates table for reusable BOQ finalize layouts
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS boq_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        config JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("[db] boq_templates table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create boq_templates table:",
      (err as any)?.message || err,
    );
  }

  // Ensure global_settings table exists
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        id VARCHAR(50) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    // Seed default terms and conditions if not exists
    const existing = await query(`SELECT * FROM global_settings WHERE id = 'terms_and_conditions'`);
    if (existing.rows.length === 0) {
      await query(`INSERT INTO global_settings (id, value) VALUES ('terms_and_conditions', '"Standard Terms: 1. Final payment as per BOQ measurements. 2. Any additional items extra."')`);
    }
    console.log("[db] global_settings table verified/created");
  } catch (err: unknown) {
    console.warn(
      "[db] Could not create global_settings table:",
      (err as any)?.message || err,
    );
  }

  // In-memory fallback storage for messages when DB is unreachable (development only)
  let inMemoryMessages: any[] = [];
  let inMemoryMessagesEnabled = false;

  // ====== PUBLIC AUTH ROUTES ======

  // POST /api/auth/signup - Register a new user
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const {
        username,
        password,
        role,
        fullName,
        mobileNumber,
        department,
        employeeCode,
        companyName,
        gstNumber,
        businessAddress,
      } = req.body;

      console.log("[signup] Received signup request:", {
        username,
        role,
        hasPassword: !!password,
        hasFullName: !!fullName,
        hasMobileNumber: !!mobileNumber,
      });

      if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
      }

      if (!role) {
        res.status(400).json({ message: "Role is required" });
        return;
      }

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        console.log("[signup] User already exists:", username);
        res.status(409).json({ message: "User already exists" });
        return;
      }

      // Create new user - pre_sales and contractor don't need extra fields
      console.log("[signup] Creating user with role:", role);
      const user = await storage.createUser({
        username,
        password,
        role: role || "user",
        fullName,
        mobileNumber,
        department: role === "pre_sales" || role === "contractor" ? null : department,
        employeeCode: role === "pre_sales" || role === "contractor" ? null : employeeCode,
        companyName: role === "supplier" ? companyName : null,
        gstNumber: role === "supplier" ? gstNumber : null,
        businessAddress: role === "supplier" ? businessAddress : null,
      });

      console.log("[signup] User created successfully:", user.id);

      // ✅ NEW: ensure approval columns exist + mark supplier as pending (DB controls approval)
      try {
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const approvedValue = role === "supplier" ? "pending" : "approved";
        await query(`UPDATE users SET approved = $2 WHERE id = $1`, [
          user.id,
          approvedValue,
        ]);
        console.log(`[signup] User ${user.id} approved status set to: ${approvedValue}`);
      } catch (err: unknown) {
        console.warn(
          "[signup] could not set approval status (continuing):",
          (err as any)?.message || err,
        );
      }

      // TODO: Store additional profile information in a separate table
      // For now, just log the additional data
      console.log(`New user registered:`, {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName,
        mobileNumber,
        department,
        employeeCode,
        companyName,
        gstNumber,
        businessAddress,
      });

      // Return user without password (NO AUTO-LOGIN, NO TOKEN)
      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({
        message: "User created successfully",
        user: userWithoutPassword,
      });
    } catch (error: any) {
      console.error("[signup] Error:", {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
        fullError: error,
      });

      // Provide more specific error messages
      if (error.code === "23505") {
        // Unique constraint violation
        res.status(409).json({ message: "Username already exists" });
      } else if (error.message?.includes("not null")) {
        res.status(400).json({ message: "Missing required field: " + error.message });
      } else {
        res.status(500).json({ message: "Signup failed: " + (error?.message || "Unknown error") });
      }
    }
  });

  // POST /api/auth/login - Login user
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
      }

      // Find user by username
      const user = await storage.getUserByUsername(username);
      // Debug logging
      // eslint-disable-next-line no-console
      console.log(
        `[auth] login attempt for username=${username} found=${!!user}`,
      );

      if (!user) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      // Check approval status for suppliers
      if (user.role === "supplier" && user.approved !== "approved") {
        if (user.approved === "pending") {
          res.status(403).json({
            message: "Account is under review. Please wait for approval.",
          });
          return;
        } else if (user.approved === "rejected") {
          res.status(403).json({
            message: `Account rejected: ${user.approvalReason || "No reason provided"
              }`,
          });
          return;
        }
      }

      // Compare password
      const isPasswordValid = await comparePasswords(password, user.password);
      // eslint-disable-next-line no-console
      console.log(
        `[auth] password valid=${isPasswordValid} for username=${username}`,
      );
      if (!isPasswordValid) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      // Generate token
      const token = generateToken(user);

      // Return user WITHOUT password
      const { password: _, ...userWithoutPassword } = user;

      res.json({
        message: "Login successful",
        user: userWithoutPassword,
        token,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/auth/forgot-password - Request password reset
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ message: "Email is required" });
        return;
      }

      // Check if user exists
      const user = await storage.getUserByUsername(email);
      if (!user) {
        // Don't reveal if email exists or not for security
        res.status(200).json({
          message: "If the email exists, a reset link has been sent",
        });
        return;
      }

      // TODO: Implement actual password reset logic
      // - Generate reset token
      // - Store token with expiry
      // - Send email with reset link

      // For now, just return success
      console.log(`Password reset requested for: ${email}`);
      res
        .status(200)
        .json({ message: "Password reset link sent to your email" });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ====== PROTECTED ROUTES ======

  // DEV-ONLY: list all in-memory users (no passwords) for debugging
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/debug/users", async (_req, res) => {
      try {
        // storage.getAllUsers returns users with hashed passwords; omit password
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (await (storage as any).getAllUsers()) as any[];
        const sanitized = all.map((u) => {
          const { password: _pw, ...rest } = u;
          return rest;
        });
        res.json({ users: sanitized });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("/api/debug/users failed", err);
        res.status(500).json({ message: "debug endpoint error" });
      }
    });
  }

  // GET /api/auth/me - Get current user profile
  app.get(
    "/api/auth/me",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res.status(401).json({ message: "Unauthorized" });
          return;
        }

        const user = await storage.getUser(req.user.id);
        if (!user) {
          res.status(404).json({ message: "User not found" });
          return;
        }

        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      } catch (error) {
        console.error("Get profile error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // ======================================================================
  // ✅ SUPPLIER APPROVAL ROUTES (ADMIN ONLY)
  // ======================================================================

  // GET /api/suppliers-pending-approval - list suppliers pending/rejected (not approved)
  app.get(
    "/api/suppliers-pending-approval",
    authMiddleware,
    requireRole("admin"),
    async (_req: Request, res: Response) => {
      try {
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `SELECT id, username, role, approved, approval_reason
           FROM users
           WHERE role = 'supplier' AND approved IS DISTINCT FROM 'approved'
           ORDER BY username ASC`,
        );

        res.json({ suppliers: result.rows });
      } catch (err: any) {
        console.error("/api/suppliers-pending-approval error", err);
        res.status(500).json({ message: "failed to list pending suppliers" });
      }
    },
  );

  // POST /api/suppliers/:id/approve - approve supplier
  app.post(
    "/api/suppliers/:id/approve",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'approved', approval_reason = NULL
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/suppliers/:id/approve error", err);
        res.status(500).json({ message: "failed to approve supplier" });
      }
    },
  );

  // POST /api/suppliers/:id/reject - reject supplier with reason
  app.post(
    "/api/suppliers/:id/reject",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'rejected', approval_reason = $2
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id, reason],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/suppliers/:id/reject error", err);
        res.status(500).json({ message: "failed to reject supplier" });
      }
    },
  );

  // ======================================================================
  // ✅ ADDED: UI COMPAT ROUTES (YOUR FRONTEND CALLS /api/admin/...)
  // ======================================================================

  // GET /api/admin/pending-suppliers (frontend expects this)
  app.get(
    "/api/admin/pending-suppliers",
    authMiddleware,
    requireRole("admin"),
    async (_req: Request, res: Response) => {
      try {
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        // Only PENDING suppliers (so the page won't show approved ones)
        const result = await query(
          `SELECT id, username, role, approved, approval_reason, created_at
           FROM users
           WHERE role = 'supplier' AND approved = 'pending'
           ORDER BY created_at DESC`,
        );

        res.json({ suppliers: result.rows });
      } catch (err: any) {
        console.error("/api/admin/pending-suppliers error", err);
        res.status(500).json({ message: "failed to list pending suppliers" });
      }
    },
  );

  // POST /api/admin/suppliers/:id/approve (frontend expects this)
  app.post(
    "/api/admin/suppliers/:id/approve",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'approved', approval_reason = NULL
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/admin/suppliers/:id/approve error", err);
        res.status(500).json({ message: "failed to approve supplier" });
      }
    },
  );

  // POST /api/admin/suppliers/:id/reject (frontend expects this)
  app.post(
    "/api/admin/suppliers/:id/reject",
    authMiddleware,
    requireRole("admin"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;

        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approved text DEFAULT 'approved'`,
        );
        await query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_reason text`,
        );

        const result = await query(
          `UPDATE users
           SET approved = 'rejected', approval_reason = $2
           WHERE id = $1 AND role = 'supplier'
           RETURNING id, username, role, approved, approval_reason`,
          [id, reason],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Supplier not found" });
          return;
        }

        res.json({ supplier: result.rows[0] });
      } catch (err: any) {
        console.error("/api/admin/suppliers/:id/reject error", err);
        res.status(500).json({ message: "failed to reject supplier" });
      }
    },
  );

  // ====== SHOPS & MATERIALS API ======

  // GET /api/shops - list shops
  app.get("/api/shops", async (_req, res) => {
    try {
      // Only return shops that are approved for public listing
      const result = await query(
        "SELECT * FROM shops WHERE approved IS TRUE ORDER BY created_at DESC",
      );
      res.json({ shops: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/shops error", err);
      res.status(500).json({ message: "failed to list shops" });
    }
  });

  // POST /api/shops - create shop (authenticated)
  app.post(
    "/api/shops",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res
            .status(401)
            .json({ message: "Unauthorized: user not authenticated" });
          return;
        }

        const body = req.body || {};
        const id = randomUUID();
        const categories = Array.isArray(body.categories)
          ? body.categories
          : [];

        // eslint-disable-next-line no-console
        console.log(
          `[POST /api/shops] inserting shop: name=${body.name}, owner_id=${req.user.id}`,
        );

        const result = await query(
          `INSERT INTO shops (id, name, location, phoneCountryCode, contactNumber, city, state, country, pincode, image, rating, categories, gstno, vendor_category, owner_id, approved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now()) RETURNING *`,
          [
            id,
            body.name || null,
            body.location || null,
            body.phoneCountryCode || null,
            body.contactNumber || null,
            body.city || null,
            body.state || null,
            body.country || null,
            body.pincode || null,
            body.image || null,
            body.rating || null,
            JSON.stringify(categories),
            body.gstNo || null,
            body.vendorCategory || null,
            req.user.id,
            false,
          ],
        );

        if (!result.rows || result.rows.length === 0) {
          res
            .status(500)
            .json({ message: "failed to create shop - no rows returned" });
          return;
        }

        res.status(201).json({ shop: result.rows[0] });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("create shop error", err);
        const errMessage = err instanceof Error ? err.message : String(err);
        res
          .status(500)
          .json({ message: "failed to create shop", error: errMessage });
      }
    },
  );

  // GET /api/materials - list materials
  app.get("/api/materials", async (_req, res) => {
    try {
      // Only return materials that are approved for public listing
      const result = await query(
        `SELECT m.*, s.name as shop_name 
         FROM materials m 
         LEFT JOIN shops s ON m.shop_id = s.id 
         WHERE m.approved IS TRUE 
         ORDER BY m.created_at DESC`,
      );
      res.json({ materials: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/materials error", err);
      res.status(500).json({ message: "failed to list materials" });
    }
  });

  // GET /api/material-rate - fetch rate for a specific material template in a shop
  app.get("/api/material-rate", async (req, res) => {
    try {
      const { template_id, shop_id } = req.query;

      if (!template_id || !shop_id) {
        res.status(400).json({
          message: "template_id and shop_id are required",
        });
        return;
      }

      // First try to fetch from approved materials
      const materialResult = await query(
        `SELECT rate, unit, brandname, modelnumber, category, subcategory, product, technicalspecification, dimensions, finishtype, metaltype 
         FROM materials 
         WHERE template_id = $1 AND shop_id = $2 AND approved IS TRUE 
         LIMIT 1`,
        [template_id, shop_id],
      );

      if (materialResult.rows.length > 0) {
        res.json({
          found: true,
          source: "approved",
          material: materialResult.rows[0],
        });
        return;
      }

      // If no approved material found, try to fetch from material submissions
      const submissionResult = await query(
        `SELECT rate, unit, brandname, modelnumber, category, subcategory, product, technicalspecification, dimensions, finishtype, metaltype 
         FROM material_submissions 
         WHERE template_id = $1 AND shop_id = $2 
         ORDER BY submitted_at DESC 
         LIMIT 1`,
        [template_id, shop_id],
      );

      if (submissionResult.rows.length > 0) {
        res.json({
          found: true,
          source: "submitted",
          material: submissionResult.rows[0],
        });
        return;
      }

      // No rate found
      res.json({
        found: false,
        source: null,
        material: null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/material-rate error", err);
      res.status(500).json({ message: "failed to fetch material rate" });
    }
  });

  // POST /api/materials - create material (authenticated)
  app.post(
    "/api/materials",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res
            .status(401)
            .json({ message: "Unauthorized: user not authenticated" });
          return;
        }

        const body = req.body || {};
        const id = randomUUID();
        // eslint-disable-next-line no-console
        console.log('[POST /api/materials] Incoming Body:', JSON.stringify(req.body, null, 2));

        const { attributes } = body;

        // Allow multiple casings
        const technicalspecification = body.technicalspecification || body.technicalSpecification || body.TechnicalSpecification || body["Technical Specification"] || null;
        const shop_id = (body.shopId === "" ? null : body.shopId) || (body.shop_id === "" ? null : body.shop_id) || null;

        // eslint-disable-next-line no-console
        console.log(
          `[POST /api/materials] extracted: name=${body.name}, shop_id=${shop_id}, technicalspecification=${technicalspecification}`,
        );

        const template_id = body.template_id || body.templateId || null;

        const result = await query(
          `INSERT INTO materials (id, template_id, name, code, rate, shop_id, unit, category, brandname, modelnumber, subcategory, product, technicalspecification, dimensions, finishtype, metaltype, image, attributes, master_material_id, approved, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, now()) RETURNING *`,
          [
            id,
            template_id,
            body.name || null,
            body.code || null,
            parseSafeNumeric(body.rate) || 0,
            shop_id,
            body.unit || null,
            body.category || null,
            body.brandName || null,
            body.modelNumber || null,
            body.subCategory || body.subcategory || null,
            body.product || null,
            technicalspecification,
            body.dimensions || body.Dimensions || null,
            body.finishtype || body.finishType || body.FinishType || null,
            body.metaltype || body.metalType || body.MetalType || null,
            body.image || null,
            JSON.stringify(attributes || {}),
            body.masterMaterialId || null,
            true, // Default to true for admin-created materials
          ],
        );

        if (!result.rows || result.rows.length === 0) {
          res
            .status(500)
            .json({ message: "failed to create material - no rows returned" });
          return;
        }

        res.status(201).json({ material: result.rows[0] });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("create material error", err);
        const errMessage = err instanceof Error ? err.message : String(err);
        res
          .status(500)
          .json({ message: "failed to create material", error: errMessage });
      }
    },
  );

  // GET /api/shops/:id
  app.get("/api/shops/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await query("SELECT * FROM shops WHERE id = $1", [id]);
      if (result.rowCount === 0)
        return res.status(404).json({ message: "not found" });
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) {
      console.error(err as any);
      res.status(500).json({ message: "error" });
    }
  });

  // PUT /api/shops/:id
  app.put("/api/shops/:id", authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};
      console.log("PUT /api/shops/:id - Received body:", JSON.stringify(body, null, 2));
      console.log("PUT /api/shops/:id - Shop ID:", id);

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      // Map of request field names to database column names
      const fieldMapping: Record<string, string> = {
        "name": "name",
        "location": "location",
        "phoneCountryCode": "phoneCountryCode",
        "contactNumber": "contactNumber",
        "city": "city",
        "state": "state",
        "country": "country",
        "pincode": "pincode",
        "image": "image",
        "rating": "rating",
        "gstNo": "gstno",
        "vendorCategory": "vendor_category",
      };

      for (const k of Object.keys(fieldMapping)) {
        if (body[k] !== undefined) {
          let value = body[k];
          // Special handling for rating - ensure it's a number or null
          if (k === 'rating') {
            value = (typeof value === 'number' && !isNaN(value)) ? value : null;
          }
          fields.push(`${fieldMapping[k]} = $${idx++}`);
          vals.push(value);
        }
      }
      if (body.categories !== undefined) {
        let categoriesValue;
        try {
          categoriesValue = Array.isArray(body.categories) ? JSON.stringify(body.categories) : JSON.stringify([]);
        } catch (e) {
          console.log("PUT /api/shops/:id - Error stringifying categories:", e);
          categoriesValue = JSON.stringify([]);
        }
        fields.push(`categories = $${idx++}`);
        vals.push(categoriesValue);
      }

      console.log("PUT /api/shops/:id - Fields to update:", fields);
      console.log("PUT /api/shops/:id - Values:", vals);

      if (fields.length === 0)
        return res.status(400).json({ message: "no fields" });
      vals.push(id);
      const q = `UPDATE shops SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
      console.log("PUT /api/shops/:id - SQL Query:", q);
      console.log("PUT /api/shops/:id - Final values array:", vals);

      const result = await query(q, vals);
      if (result.rowCount === 0) {
        console.log("PUT /api/shops/:id - No rows updated, shop not found");
        return res.status(404).json({ message: "Shop not found" });
      }
      console.log("PUT /api/shops/:id - Update successful, rows affected:", result.rowCount);
      res.json({ shop: result.rows[0] });
    } catch (err: unknown) {
      console.error("PUT /api/shops/:id - Database error:", err);
      if (err instanceof Error) {
        console.error("PUT /api/shops/:id - Error message:", err.message);
        console.error("PUT /api/shops/:id - Error stack:", err.stack);
      }
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ message: "Failed to update shop", error: errorMessage });
    }
  });

  // DELETE /api/shops/:id
  app.delete(
    "/api/shops/:id",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        await query("DELETE FROM materials WHERE shop_id = $1", [id]);
        await query("DELETE FROM shops WHERE id = $1", [id]);
        res.json({ message: "deleted" });
      } catch (err: unknown) {
        console.error(err as any);
        res.status(500).json({ message: "error" });
      }
    },
  );

  // Approve / reject shop
  app.post(
    "/api/shops/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        // ensure approved column exists
        await query(
          "ALTER TABLE shops ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE shops ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE shops SET approved = true, approval_reason = NULL WHERE id = $1 RETURNING *",
          [id],
        );
        res.json({ shop: result.rows[0] });
      } catch (err: unknown) {
        console.error(err as any);
        res.status(500).json({ message: "error" });
      }
    },
  );

  app.post(
    "/api/shops/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        // Delete associated materials first, then the shop itself
        await query("DELETE FROM materials WHERE shop_id = $1", [id]);
        await query("DELETE FROM shops WHERE id = $1", [id]);
        res.json({ message: "Shop rejected and removed", id });
      } catch (err: unknown) {
        console.error(err as any);
        res.status(500).json({ message: "error" });
      }
    },
  );

  // MATERIAL endpoints: GET by id, PUT, DELETE, approve/reject
  app.get("/api/materials/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const result = await query(
        `SELECT m.*, s.name as shop_name 
         FROM materials m 
         LEFT JOIN shops s ON m.shop_id = s.id 
         WHERE m.id = $1`,
        [id],
      );
      if (result.rowCount === 0)
        return res.status(404).json({ message: "not found" });
      res.json({ material: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "error" });
    }
  });

  app.put("/api/materials/:id", authMiddleware, async (req, res) => {
    try {
      const id = req.params.id;
      const body = req.body || {};
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      for (const k of [
        "name",
        "code",
        "rate",
        "shop_id",
        "unit",
        "category",
        "brandname",
        "modelnumber",
        "subcategory",
        "product",
        "technicalspecification",
        "dimensions",
        "finishtype",
        "metaltype",
        "image",
        "template_id",
        "templateId"
      ]) {
        if (body[k] !== undefined) {
          let val = body[k];
          let dbFieldName = k;
          if (k === "templateId") dbFieldName = "template_id";

          if (dbFieldName === "shop_id" && val === "") val = null;
          if (dbFieldName === "rate") val = parseSafeNumeric(val);
          fields.push(`${dbFieldName} = $${idx++}`);
          vals.push(val);
        }
      }
      if (body.attributes !== undefined) {
        fields.push(`attributes = $${idx++}`);
        vals.push(JSON.stringify(body.attributes));
      }
      if (fields.length === 0)
        return res.status(400).json({ message: "no fields" });
      vals.push(id);
      const q = `UPDATE materials SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
      console.log('[PUT /api/materials/:id] body:', body);
      console.log('[PUT /api/materials/:id] query:', q);
      console.log('[PUT /api/materials/:id] vals:', vals);
      const result = await query(q, vals);
      res.json({ material: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "error" });
    }
  });

  app.delete(
    "/api/materials/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;

        // Look up the material first to find template_id and shop_id
        const matResult = await query("SELECT template_id, shop_id, name, code FROM materials WHERE id = $1", [id]);
        const mat = matResult.rows[0];

        // Delete the material
        await query("DELETE FROM materials WHERE id = $1", [id]);

        // Also clean up matching material_submissions so stale data doesn't resurface
        if (mat) {
          if (mat.template_id && mat.shop_id) {
            await query(
              "DELETE FROM material_submissions WHERE template_id = $1 AND shop_id = $2",
              [mat.template_id, mat.shop_id]
            );
          }
          // Also try to clean up by name/code match if template_id was null
          if (!mat.template_id && mat.shop_id && (mat.name || mat.code)) {
            await query(
              "DELETE FROM material_submissions WHERE shop_id = $1 AND (name = $2 OR code = $3)",
              [mat.shop_id, mat.name, mat.code]
            );
          }
        }

        res.json({ message: "deleted" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "error" });
      }
    },
  );

  app.post(
    "/api/materials/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE materials SET approved = true, approval_reason = NULL WHERE id = $1 RETURNING *",
          [id],
        );
        res.json({ material: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "error" });
      }
    },
  );

  app.post(
    "/api/materials/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req, res) => {
      try {
        const id = req.params.id;
        const reason = req.body?.reason || null;
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true",
        );
        await query(
          "ALTER TABLE materials ADD COLUMN IF NOT EXISTS approval_reason text",
        );
        const result = await query(
          "UPDATE materials SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *",
          [id, reason],
        );
        res.json({ material: result.rows[0] });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "error" });
      }
    },
  );


  app.get("/api/shops-pending-approval", async (_req, res) => {
    try {
      const result = await query(
        "SELECT * FROM shops WHERE approved IS NOT TRUE ORDER BY created_at DESC",
      );
      const requests = result.rows.map((r: any) => ({
        id: r.id,
        status: "pending",
        shop: r,
      }));
      res.json({ shops: requests });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("/api/shops-pending-approval error", err);
      res.status(500).json({ message: "failed to list pending shops" });
    }
  });

  // ====== VENDOR CATEGORIES ROUTES ======

  // GET /api/vendor-categories - List all vendor categories
  app.get("/api/vendor-categories", async (_req, res) => {
    try {
      const result = await query(
        "SELECT * FROM vendor_categories ORDER BY name ASC",
      );
      res.json({ categories: result.rows });
    } catch (err) {
      console.error("/api/vendor-categories GET error", err);
      res.status(500).json({ message: "failed to list vendor categories" });
    }
  });

  // POST /api/vendor-categories - Create a new vendor category
  app.post(
    "/api/vendor-categories",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name, description } = req.body;

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Name is required" });
          return;
        }

        // Case-insensitive check before insert
        const existing = await query(
          "SELECT id FROM vendor_categories WHERE LOWER(name) = LOWER($1)",
          [name.trim()],
        );

        if (existing.rows.length > 0) {
          res.status(409).json({ message: "VENDOR CATEGORY ALREADY EXISTS" });
          return;
        }

        const result = await query(
          `INSERT INTO vendor_categories (name, description, created_at, updated_at) 
           VALUES ($1, $2, NOW(), NOW()) 
           RETURNING *`,
          [name.trim(), description || null],
        );

        res.status(201).json({ category: result.rows[0] });
      } catch (err: any) {
        console.error("/api/vendor-categories POST error", err);
        if (err.code === "23505") {
          // Unique constraint violation
          res.status(409).json({ message: "VENDOR CATEGORY ALREADY EXISTS" });
        } else {
          res.status(500).json({ message: "failed to create vendor category" });
        }
      }
    },
  );

  // PUT /api/vendor-categories/:id - Update a vendor category
  app.put(
    "/api/vendor-categories/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const { name, description } = req.body;

        const fields: string[] = [];
        const vals: any[] = [];
        let idx = 1;

        if (name !== undefined && name.trim()) {
          fields.push(`name = $${idx++}`);
          vals.push(name.trim());
        }

        if (description !== undefined) {
          fields.push(`description = $${idx++}`);
          vals.push(description);
        }

        if (fields.length === 0) {
          res.status(400).json({ message: "No fields to update" });
          return;
        }

        fields.push(`updated_at = $${idx++}`);
        vals.push(new Date());
        vals.push(id);

        const q = `UPDATE vendor_categories SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
        const result = await query(q, vals);

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Vendor category not found" });
          return;
        }

        res.json({ category: result.rows[0] });
      } catch (err: any) {
        console.error("/api/vendor-categories PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Vendor category name already exists" });
        } else {
          res.status(500).json({ message: "failed to update vendor category" });
        }
      }
    },
  );

  // DELETE /api/vendor-categories/:id - Delete a vendor category
  app.delete(
    "/api/vendor-categories/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        const result = await query(
          "DELETE FROM vendor_categories WHERE id = $1 RETURNING id",
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Vendor category not found" });
          return;
        }

        res.json({ message: "Vendor category deleted successfully" });
      } catch (err: any) {
        console.error("/api/vendor-categories DELETE error", err);
        res.status(500).json({ message: "failed to delete vendor category" });
      }
    },
  );

  // ====== MATERIAL TEMPLATES ROUTES (Admin/Software Team only) ======

  // GET /api/material-templates - List all material templates
  app.get("/api/material-templates", async (_req, res) => {
    try {
      const result = await query(
        "SELECT * FROM material_templates ORDER BY created_at DESC",
      );
      res.json({ templates: result.rows });
    } catch (err) {
      console.error("/api/material-templates error", err);
      res.status(500).json({ message: "failed to list material templates" });
    }
  });

  // POST /api/material-templates - Create a new material template
  app.post(
    "/api/material-templates",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { name, code, category, subcategory, vendorCategory, taxCodeType, taxCodeValue } = req.body;

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Template name is required" });
          return;
        }

        if (!code || !code.trim()) {
          res.status(400).json({ message: "Template code is required" });
          return;
        }

        const id = randomUUID();
        const result = await query(
          `INSERT INTO material_templates (id, name, code, category, subcategory, vendor_category, tax_code_type, tax_code_value, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()) 
         RETURNING *`,
          [id, name.trim(), code.trim(), category || null, subcategory || null, vendorCategory || null, taxCodeType || null, taxCodeValue || null],
        );

        res.status(201).json({ template: result.rows[0] });
      } catch (err) {
        console.error("/api/material-templates POST error", err);
        res.status(500).json({ message: "failed to create material template" });
      }
    },
  );

  // PUT /api/material-templates/:id - Update a material template
  app.put(
    "/api/material-templates/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        console.log('[PUT /api/material-templates/:id] user:', (req as any).user);
        console.log('[PUT /api/material-templates/:id] params.id:', req.params.id);
        console.log('[PUT /api/material-templates/:id] body:', req.body);
        const { name, code, category, subcategory, vendorCategory, taxCodeType, taxCodeValue, vendor_category, tax_code_type, tax_code_value } = req.body;

        // Only update fields that are provided
        const fields: string[] = [];
        const vals: any[] = [];
        let idx = 1;

        if (name !== undefined) {
          fields.push(`name = $${idx++}`);
          vals.push(name?.trim() || null);
        }
        if (code !== undefined) {
          fields.push(`code = $${idx++}`);
          vals.push(code?.trim() || null);
        }
        if (category !== undefined) {
          fields.push(`category = $${idx++}`);
          vals.push(category || null);
        }
        if (subcategory !== undefined) {
          fields.push(`subcategory = $${idx++}`);
          vals.push(subcategory || null);
        }
        if (vendorCategory !== undefined || vendor_category !== undefined) {
          fields.push(`vendor_category = $${idx++}`);
          vals.push((vendorCategory !== undefined ? vendorCategory : vendor_category) || null);
        }
        if (taxCodeType !== undefined || tax_code_type !== undefined) {
          fields.push(`tax_code_type = $${idx++}`);
          vals.push((taxCodeType !== undefined ? taxCodeType : tax_code_type) || null);
        }
        if (taxCodeValue !== undefined || tax_code_value !== undefined) {
          fields.push(`tax_code_value = $${idx++}`);
          vals.push((taxCodeValue !== undefined ? taxCodeValue : tax_code_value) || null);
        }

        if (fields.length === 0) {
          res.status(400).json({ message: "No fields to update" });
          return;
        }

        fields.push(`updated_at = $${idx++}`);
        vals.push(new Date());
        vals.push(id);

        const q = `UPDATE material_templates SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
        console.log('[material-templates PUT] query:', q, 'vals:', vals);
        const result = await query(q, vals);

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Template not found" });
          return;
        }

        // Cascade name/code/category/subcategory changes to linked materials
        const updated = result.rows[0];
        try {
          const cascadeFields: string[] = [];
          const cascadeVals: any[] = [];
          let ci = 1;

          if (updated.name) { cascadeFields.push(`name = $${ci++}`); cascadeVals.push(updated.name); }
          if (updated.code) { cascadeFields.push(`code = $${ci++}`); cascadeVals.push(updated.code); }
          if (updated.category !== undefined) { cascadeFields.push(`category = $${ci++}`); cascadeVals.push(updated.category); }
          if (updated.subcategory !== undefined) { cascadeFields.push(`subcategory = $${ci++}`); cascadeVals.push(updated.subcategory); }

          if (cascadeFields.length > 0) {
            cascadeVals.push(id);
            const cascadeQ = `UPDATE materials SET ${cascadeFields.join(", ")} WHERE template_id = $${ci}`;
            const cascadeRes = await query(cascadeQ, cascadeVals);
            console.log(`[material-templates PUT] Cascaded updates to ${cascadeRes.rowCount} linked materials`);
          }
        } catch (cascadeErr) {
          console.warn("[material-templates PUT] Cascade to materials failed (non-fatal):", cascadeErr);
        }

        res.json({ template: result.rows[0] });
      } catch (err) {
        console.error("/api/material-templates PUT error", err);
        res.status(500).json({ message: "failed to update material template" });
      }
    },
  );

  // GET /api/material-templates/:id/impact - Get impact info before deleting a template
  app.get(
    "/api/material-templates/:id/impact",
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        // Get template details
        const tplRes = await query("SELECT name, code FROM material_templates WHERE id = $1", [id]);
        if (tplRes.rows.length === 0) {
          res.status(404).json({ message: "Template not found" });
          return;
        }
        const tpl = tplRes.rows[0];

        // Get linked materials (by template_id)
        const linkedMats = await query(
          `SELECT m.id, m.name, m.code, m.rate, m.unit, m.shop_id, s.name as shop_name
           FROM materials m
           LEFT JOIN shops s ON m.shop_id = s.id
           WHERE m.template_id = $1
           ORDER BY s.name, m.name`,
          [id],
        );

        // Get orphaned materials (template_id IS NULL but matching name/code)
        const orphanMats = await query(
          `SELECT m.id, m.name, m.code, m.rate, m.unit, m.shop_id, s.name as shop_name
           FROM materials m
           LEFT JOIN shops s ON m.shop_id = s.id
           WHERE m.template_id IS NULL AND (m.name = $1 OR m.code = $2)
           ORDER BY s.name, m.name`,
          [tpl.name, tpl.code],
        );

        // Get material submissions
        const subs = await query(
          `SELECT ms.id, ms.rate, ms.unit, ms.shop_id, s.name as shop_name
           FROM material_submissions ms
           LEFT JOIN shops s ON ms.shop_id = s.id
           WHERE ms.template_id = $1
           ORDER BY s.name`,
          [id],
        );

        res.json({
          template: tpl,
          linkedMaterials: linkedMats.rows,
          orphanedMaterials: orphanMats.rows,
          submissions: subs.rows,
          totalAffected: linkedMats.rows.length + orphanMats.rows.length + subs.rows.length,
        });
      } catch (err) {
        console.error("/api/material-templates/:id/impact error", err);
        res.status(500).json({ message: "Failed to fetch impact" });
      }
    },
  );

  // DELETE /api/material-templates/:id - Delete a material template
  app.delete(
    "/api/material-templates/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        console.log(
          "[DELETE /material-templates/:id] Attempting to delete template:",
          id,
        );

        // First, check if template exists
        const checkResult = await query(
          "SELECT id FROM material_templates WHERE id = $1",
          [id],
        );
        console.log("[DELETE] Template exists?", checkResult.rows.length > 0);

        if (checkResult.rows.length === 0) {
          console.log("[DELETE] Template not found");
          res.status(404).json({ message: "Template not found" });
          return;
        }

        // Perform dependent deletes inside a transaction to avoid FK violations
        console.log(
          "[DELETE] Beginning transaction to remove dependent rows for template_id =",
          id,
        );
        await query("BEGIN");
        try {
          // Remove any material_submissions that reference this template
          console.log(
            "[DELETE] Deleting material_submissions with template_id =",
            id,
          );
          const subsRes = await query(
            "DELETE FROM material_submissions WHERE template_id = $1",
            [id],
          );
          console.log(
            "[DELETE] Deleted material_submissions:",
            subsRes.rowCount,
          );

          // Before deleting the template, identify any orphaned materials 
          // (template_id is null) that match this template's name/code
          const templateResult = await query("SELECT name, code FROM material_templates WHERE id = $1", [id]);
          const tpl = templateResult.rows[0];

          if (tpl) {
            console.log("[DELETE] Cleaning up orphaned materials for:", tpl.name, tpl.code);
            const orphanRes = await query(
              "DELETE FROM materials WHERE template_id IS NULL AND (name = $1 OR code = $2)",
              [tpl.name, tpl.code]
            );
            console.log("[DELETE] Deleted orphaned materials:", orphanRes.rowCount);
          }

          // Also delete any materials that reference this template
          console.log("[DELETE] Deleting materials with template_id =", id);
          const matsResult = await query(
            "DELETE FROM materials WHERE template_id = $1",
            [id],
          );
          console.log("[DELETE] Deleted materials:", matsResult.rowCount);

          // Delete the template itself
          console.log("[DELETE] Deleting material_template with id =", id);
          const result = await query(
            "DELETE FROM material_templates WHERE id = $1 RETURNING id",
            [id],
          );
          console.log(
            "[DELETE] Delete result rows:",
            result.rows.length,
            "rowCount:",
            result.rowCount,
          );

          await query("COMMIT");

          if (result.rows.length === 0) {
            console.log("[DELETE] No rows deleted");
            res.status(404).json({ message: "Template not found" });
            return;
          }

          console.log(
            "[DELETE] Successfully deleted template and dependents:",
            id,
          );
          res.json({ message: "Template deleted successfully" });
          return;
        } catch (innerErr) {
          console.error("[DELETE] Transaction failed, rolling back", innerErr);
          try {
            await query("ROLLBACK");
          } catch (rbErr) {
            console.error("ROLLBACK failed", rbErr);
          }
          throw innerErr;
        }

        if (checkResult.rows.length === 0) {
          console.log("[DELETE] No rows deleted");
          res.status(404).json({ message: "Template not found" });
          return;
        }

        console.log("[DELETE] Successfully deleted template:", id);
        res.json({ message: "Template deleted successfully" });
      } catch (err) {
        console.error("/api/material-templates DELETE error", err);
        res.status(500).json({
          message: "failed to delete material template",
          error: String(err),
        });
      }
    },
  );

  // GET /api/material-categories - List categories created by admin/software_team/purchase_team
  app.get("/api/material-categories", async (_req, res) => {
    try {
      // Return all categories (including seeded ones)
      const result = await query(`
        SELECT DISTINCT name FROM material_categories
        ORDER BY name ASC
      `);
      const categories = result.rows.map((row) => row.name).filter(Boolean);
      res.json({ categories });
    } catch (err) {
      console.error("/api/material-categories error", err);
      res.status(500).json({ message: "failed to list categories" });
    }
  });

  // POST /api/bulk-materials - Bulk upload material rows (admin / software_team / purchase_team)
  app.post(
    "/api/bulk-materials",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

      if (rows.length === 0) {
        res.status(400).json({ message: "No rows provided" });
        return;
      }

      const createdTemplates: any[] = [];
      const createdSubmissions: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      try {
        await query("BEGIN");
        // eslint-disable-next-line no-console
        console.log(`[POST /api/bulk-materials] Processing ${rows.length} rows`);

        for (let i = 0; i < rows.length; i++) {
          const raw = rows[i] || {};
          const name = (raw.name || raw.Name || "").toString().trim();
          const code = (raw.code || raw.Code || raw.item_code || "").toString().trim();
          const category = (raw.category || raw.Category || "").toString().trim() || null;
          const subcategory = (raw.subcategory || raw.Subcategory || "").toString().trim() || null;
          const unit = (raw.unit || raw.Unit || "").toString().trim() || null;
          const rate = parseSafeNumeric(raw.rate);
          const vendor_category = (raw.vendor_category || raw.vendorCategory || null) || null;
          let tax_code_type = (raw.tax_code_type || raw.taxCodeType || null) || null;

          if (tax_code_type) {
            const t = String(tax_code_type).toLowerCase().trim();
            if (t.includes("hsn")) tax_code_type = "hsn";
            else if (t.includes("sac")) tax_code_type = "sac";
            else if (t.includes("gst")) tax_code_type = "hsn";
            else tax_code_type = null;
          }
          const tax_code_value = (raw.tax_code_value || raw.taxCodeValue || null) || null;
          const technicalspecification = (raw.technicalspecification || raw.technicalSpecification || raw.TechnicalSpecification || raw["Technical Specification"] || null) || null;
          const shop_name = (raw.shop_name || raw.ShopName || raw.shopName || raw["Shop Name"] || "").toString().trim();

          if (!name) {
            skipped.push({ row: i, reason: "missing name" });
            continue;
          }

          let shop_id = null;
          if (shop_name) {
            const shopRes = await query(`SELECT id FROM shops WHERE LOWER(name) = LOWER($1) LIMIT 1`, [shop_name]);
            if (shopRes.rows.length > 0) {
              shop_id = shopRes.rows[0].id;
            } else {
              errors.push({ row: i, error: `Shop "${shop_name}" not found in database.` });
              continue;
            }
          } else {
            errors.push({ row: i, error: "Shop name is required for bulk upload." });
            continue;
          }

          // Ensure category and subcategory exist in their own lookup tables
          if (category) {
            try {
              const catExists = await query('SELECT id FROM material_categories WHERE LOWER(name) = LOWER($1) LIMIT 1', [category]);
              if (catExists.rows.length === 0) {
                await query('INSERT INTO material_categories (id, name, created_at) VALUES ($1, $2, NOW())', [randomUUID(), category]);
              }
            } catch (catErr) {
              console.warn(`[Bulk Upload] Failed to ensure category "${category}":`, catErr);
            }
          }

          if (category && subcategory) {
            try {
              const subExists = await query('SELECT id FROM material_subcategories WHERE LOWER(name) = LOWER($1) AND LOWER(category) = LOWER($2) LIMIT 1', [subcategory, category]);
              if (subExists.rows.length === 0) {
                await query('INSERT INTO material_subcategories (id, name, category, created_at) VALUES ($1, $2, $3, NOW())', [randomUUID(), subcategory, category]);
              }
            } catch (subErr) {
              console.warn(`[Bulk Upload] Failed to ensure subcategory "${subcategory}" for category "${category}":`, subErr);
            }
          }

          // Ensure or create material_template
          let templateId: string | null = null;
          try {
            if (code) {
              const existing = await query(`SELECT id FROM material_templates WHERE code = $1 LIMIT 1`, [code]);
              if (existing.rows.length > 0) templateId = existing.rows[0].id;
            }
            if (!templateId) {
              const byName = await query(`SELECT id FROM material_templates WHERE name = $1 LIMIT 1`, [name]);
              if (byName.rows.length > 0) templateId = byName.rows[0].id;
            }

            if (!templateId) {
              const tId = randomUUID();
              const tCode = code || `ITM-${tId.slice(0, 8)}`;
              const tpl = await query(
                `INSERT INTO material_templates (id, name, code, category, subcategory, vendor_category, tax_code_type, tax_code_value, technicalspecification, brandname, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING *`,
                [tId, name, tCode, category, subcategory, vendor_category, tax_code_type, tax_code_value, technicalspecification, raw.brandname || raw.brandName || null],
              );
              templateId = tpl.rows[0].id;
              createdTemplates.push(tpl.rows[0]);
            }
          } catch (tplErr) {
            errors.push({ row: i, error: `Template error: ${String(tplErr)}` });
            continue;
          }

          // Create Material Submission instead of direct material
          try {
            const msId = randomUUID();
            const submission = await query(
              `INSERT INTO material_submissions (id, template_id, shop_id, rate, unit, brandname, modelnumber, subcategory, category, product, technicalspecification, dimensions, finishtype, metaltype, submitted_by, submitted_at, approved)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NULL)
               RETURNING *`,
              [
                msId,
                templateId,
                shop_id,
                rate,
                unit,
                raw.brandname || raw.brandName || null,
                raw.modelnumber || raw.modelNumber || null,
                subcategory,
                category,
                raw.product || null,
                technicalspecification,
                raw.dimensions || null,
                raw.finishtype || raw.finish || null,
                raw.metaltype || raw.metalType || null,
                (req as any).user?.id
              ],
            );
            createdSubmissions.push(submission.rows[0]);
          } catch (msErr) {
            errors.push({ row: i, error: `Submission error: ${String(msErr)}` });
            continue;
          }
        }

        await query("COMMIT");

        res.json({
          message: "Bulk upload submitted for approval",
          createdTemplatesCount: createdTemplates.length,
          createdSubmissionsCount: createdSubmissions.length,
          skipped,
          errors,
        });
      } catch (err) {
        try { await query("ROLLBACK"); } catch (rbErr) { console.error("rollback failed", rbErr); }
        console.error("/api/bulk-materials error", err);
        res.status(500).json({ message: "bulk upload failed", error: String(err) });
      }
    },
  );

  // POST /api/bulk-shops - Bulk upload shop rows (admin / software_team / purchase_team)
  app.post(
    "/api/bulk-shops",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

      if (rows.length === 0) {
        res.status(400).json({ message: "No rows provided" });
        return;
      }

      const createdShops: any[] = [];
      const skipped: any[] = [];
      const errors: any[] = [];

      try {
        await query("BEGIN");
        // eslint-disable-next-line no-console
        console.log(`[POST /api/bulk-shops] Processing ${rows.length} rows`);

        for (let i = 0; i < rows.length; i++) {
          const raw = rows[i] || {};
          const name = (raw.name || raw.Name || "").toString().trim();
          const location = (raw.location || raw.Location || "").toString().trim() || null;
          const city = (raw.city || raw.City || "").toString().trim() || null;
          const phoneCountryCode = (raw.phoneCountryCode || raw.phone_country_code || "").toString().trim() || "+91";
          const contactNumber = (raw.contactNumber || raw.contact_number || raw.Phone || "").toString().trim() || null;
          const state = (raw.state || raw.State || "").toString().trim() || null;
          const country = (raw.country || raw.Country || "").toString().trim() || "India";
          const pincode = (raw.pincode || raw.Pincode || raw.Zipcode || "").toString().trim() || null;
          const gstNo = (raw.gstNo || raw.gst_no || raw.gstno || raw.GST || "").toString().trim() || null;
          const vendorCategory = (raw.vendorCategory || raw.vendor_category || "").toString().trim() || null;

          if (!name) {
            skipped.push({ row: i, reason: "missing name" });
            continue;
          }

          if (!city) {
            skipped.push({ row: i, reason: "missing city" });
            continue;
          }

          try {
            const id = randomUUID();
            const result = await query(
              `INSERT INTO shops (id, name, location, phonecountrycode, contactnumber, city, state, country, pincode, gstno, vendor_category, owner_id, approved, created_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now()) RETURNING *`,
              [
                id,
                name,
                location,
                phoneCountryCode,
                contactNumber,
                city,
                state,
                country,
                pincode,
                gstNo,
                vendorCategory,
                (req as any).user.id,
                false, // Bulk uploaded shops go through approval flow
              ],
            );
            createdShops.push(result.rows[0]);
          } catch (insertErr) {
            errors.push({ row: i, error: `Insert error: ${String(insertErr)}` });
            continue;
          }
        }

        await query("COMMIT");

        res.json({
          message: "Bulk shops uploaded successfully",
          createdShopsCount: createdShops.length,
          skipped,
          errors,
        });
      } catch (err) {
        try { await query("ROLLBACK"); } catch (rbErr) { console.error("rollback failed", rbErr); }
        console.error("/api/bulk-shops error", err);
        res.status(500).json({ message: "bulk shop upload failed", error: String(err) });
      }
    },
  );

  // GET /api/material-subcategories/:category - List subcategories created by admin/software_team/purchase_team
  app.get(
    "/api/material-subcategories/:category",
    async (req: Request, res: Response) => {
      try {
        const { category } = req.params;
        // Return all subcategories for a category (including seeded ones)
        const result = await query(
          `
        SELECT DISTINCT name FROM material_subcategories 
        WHERE category = $1
        ORDER BY name ASC
      `,
          [category],
        );
        const subcategories = result.rows
          .map((row) => row.name)
          .filter(Boolean);
        res.json({ subcategories });
      } catch (err) {
        console.error("/api/material-subcategories error", err);
        res.status(500).json({ message: "failed to list subcategories" });
      }
    },
  );

  // POST /api/categories - Create a new category (Admin/Software Team/Purchase Team/Pre Sales)
  app.post(
    "/api/categories",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { name } = req.body;

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Category name is required" });
          return;
        }

        const id = randomUUID();
        const userId = (req as any).user?.id;
        const result = await query(
          `INSERT INTO material_categories (id, name, created_by) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
          [id, name.trim(), userId || null],
        );

        res.status(201).json({ category: result.rows[0] });
      } catch (err: any) {
        console.error("/api/categories error", err as any);
        if (err.code === "23505") {
          res.status(409).json({ message: "Category already exists" });
        } else {
          res.status(500).json({
            message: "failed to create category",
            error: err.message,
          });
        }
      }
    },
  );

  // POST /api/subcategories - Create a new subcategory (Admin/Software Team/Purchase Team)
  app.post(
    "/api/subcategories",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { name, category } = req.body;

        if (!name || !name.trim() || !category || !category.trim()) {
          res.status(400).json({
            message: "Subcategory name and parent category are required",
          });
          return;
        }

        const id = randomUUID();
        const userId = (req as any).user?.id;
        const result = await query(
          `INSERT INTO material_subcategories (id, name, category, created_by) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id::text, name, category, created_at, created_by`,
          [id, name.trim(), category.trim(), userId || null],
        );

        res.status(201).json({ subcategory: result.rows[0] });
      } catch (err: any) {
        console.error("/api/subcategories error", err as any);
        if (err.code === "23505") {
          res.status(409).json({
            message: "Subcategory already exists for this category",
          });
        } else {
          res.status(500).json({
            message: "failed to create subcategory",
            error: err.message,
          });
        }
      }
    },
  );

  // PUT /api/categories/:name - Update a category name
  app.put(
    "/api/categories/:name",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { name: oldName } = req.params;
        const { name: newName } = req.body;

        if (!newName || !newName.trim()) {
          res.status(400).json({ message: "Category name is required" });
          return;
        }

        // Update the category
        const result = await query(
          `UPDATE material_categories SET name = $1 WHERE name = $2 RETURNING *`,
          [newName.trim(), decodeURIComponent(oldName)],
        );

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Category not found" });
          return;
        }

        // Update all subcategories that reference this category
        await query(
          `UPDATE material_subcategories SET category = $1 WHERE category = $2`,
          [newName.trim(), decodeURIComponent(oldName)],
        );

        res.json({ category: result.rows[0] });
      } catch (err: any) {
        console.error("/api/categories PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Category already exists" });
        } else {
          res.status(500).json({ message: "failed to update category", error: err.message });
        }
      }
    },
  );

  // PUT /api/subcategories/:id - Update a subcategory name
  app.put(
    "/api/subcategories/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name: newName, category } = req.body;

        if (!newName || !newName.trim()) {
          res.status(400).json({ message: "Subcategory name is required" });
          return;
        }

        // Update the subcategory
        const result = await query(
          `UPDATE material_subcategories SET name = $1, category = $2 WHERE id = $3 RETURNING id::text, name, category, created_at, created_by`,
          [newName.trim(), category, id],
        );

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Subcategory not found" });
          return;
        }

        res.json({ subcategory: result.rows[0] });
      } catch (err: any) {
        console.error("/api/subcategories PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Subcategory already exists" });
        } else {
          res.status(500).json({ message: "failed to update subcategory", error: err.message });
        }
      }
    },
  );

  // GET /api/categories/:name/impact - Get impact of deleting a category
  app.get(
    "/api/categories/:name/impact",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const name = decodeURIComponent(req.params.name);

        const subcategories = await query("SELECT name FROM material_subcategories WHERE category = $1", [name]);
        const templates = await query("SELECT name FROM material_templates WHERE category = $1", [name]);
        const materials = await query("SELECT name FROM materials WHERE template_id IN (SELECT id FROM material_templates WHERE category = $1)", [name]);

        // Also find products associated with any of these subcategories
        const products = await query("SELECT name FROM products WHERE subcategory IN (SELECT name FROM material_subcategories WHERE category = $1)", [name]);

        res.json({
          subcategories: subcategories.rows.map(r => r.name),
          templates: templates.rows.map(r => r.name),
          materials: materials.rows.map(r => r.name),
          products: products.rows.map(r => r.name)
        });
      } catch (err) {
        console.error("/api/categories/:name/impact error", err);
        res.status(500).json({ message: "failed to get category impact" });
      }
    }
  );

  // GET /api/subcategories/:id/impact - Get impact of deleting a subcategory
  app.get(
    "/api/subcategories/:id/impact",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        // Find subcategory name first to query products/materials
        const subResult = await query("SELECT name FROM material_subcategories WHERE id = $1", [id]);
        if (subResult.rows.length === 0) {
          return res.status(404).json({ message: "Subcategory not found" });
        }
        const subName = subResult.rows[0].name;

        const products = await query("SELECT name FROM products WHERE subcategory = $1", [subName]);
        const materials = await query("SELECT name FROM materials WHERE subcategory = $1", [subName]);

        res.json({
          products: products.rows.map(r => r.name),
          materials: materials.rows.map(r => r.name)
        });
      } catch (err) {
        console.error("/api/subcategories/:id/impact error", err);
        res.status(500).json({ message: "failed to get subcategory impact" });
      }
    }
  );

  // DELETE /api/subcategories/:id - Delete a subcategory (Admin/Software Team/Purchase Team)
  app.delete(
    "/api/subcategories/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;

        // Find subcategory name first to update materials/templates
        const subResult = await query("SELECT name FROM material_subcategories WHERE id = $1", [id]);
        if (subResult.rows.length === 0) {
          return res.status(404).json({ message: "Subcategory not found" });
        }
        const subName = subResult.rows[0].name;

        // Update materials to be uncategorized for this subcategory
        await query(
          "UPDATE materials SET subcategory = NULL WHERE subcategory = $1",
          [subName]
        );

        // Update material templates
        await query(
          "UPDATE material_templates SET subcategory = NULL WHERE subcategory = $1",
          [subName]
        );

        // Simply delete the subcategory record from lookup table
        const result = await query(
          "DELETE FROM material_subcategories WHERE id = $1 RETURNING id",
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Subcategory not found" });
          return;
        }

        res.json({ message: "Subcategory deleted successfully (materials uncategorized)" });
      } catch (err: any) {
        console.error("/api/subcategories DELETE error:", {
          message: err.message,
          code: err.code,
          detail: err.detail
        });
        res.status(500).json({
          message: "failed to delete subcategory",
          error: err.message
        });
      }
    },
  );

  // GET /api/categories - List all categories created by admin (including seeded ones)
  app.get("/api/categories", async (_req, res) => {
    try {
      const result = await query(`
        SELECT * FROM material_categories 
        ORDER BY created_at DESC
      `);

      res.json({ categories: result.rows.map((r) => r.name) });
    } catch (err: unknown) {
      console.error("/api/categories error", err as any);
      res.status(500).json({ message: "failed to list categories" });
    }
  });

  // DELETE /api/categories/:name - Delete a category and its subcategories (Admin/Software Team/Purchase Team/Pre Sales)
  app.delete(
    "/api/categories/:name",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const name = req.params.name;
        console.log("DELETE category request for:", name);
        if (!name)
          return res.status(400).json({ message: "category name required" });

        // Update materials to be uncategorized for this category
        console.log("Uncategorizing materials for category:", name);
        const materialsUpdateResult = await query(
          "UPDATE materials SET category = NULL WHERE category = $1",
          [name],
        );
        console.log("Updated materials (uncategorized):", materialsUpdateResult.rowCount);

        // Update material_templates to be uncategorized for this category
        console.log("Uncategorizing material templates for category:", name);
        const templatesUpdateResult = await query(
          "UPDATE material_templates SET category = NULL WHERE category = $1",
          [name],
        );
        console.log("Updated templates (uncategorized):", templatesUpdateResult.rowCount);

        // Delete subcategories for this category (Lookup table entries)
        console.log("Deleting subcategories records for category:", name);
        const subcatsResult = await query(
          "DELETE FROM material_subcategories WHERE category = $1",
          [name],
        );
        console.log("Deleted subcategories records:", subcatsResult.rowCount);

        // Delete the category record itself
        console.log("Deleting category record:", name);
        const result = await query(
          "DELETE FROM material_categories WHERE name = $1 RETURNING *",
          [name],
        );
        console.log(
          "Deleted category record result:",
          result.rowCount,
          result.rows[0],
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ message: "Category not found" });
        }

        res.json({ message: "Category deleted (materials and templates uncategorized)", category: result.rows[0] });
      } catch (err) {
        console.error("/api/categories/:name DELETE error", err);
        res.status(500).json({ message: "failed to delete category" });
      }
    },
  );

  // GET /api/subcategories-admin - List all subcategories for admin (from DB)
  app.get("/api/subcategories-admin", async (_req, res) => {
    try {
      const result = await query(`
        SELECT id::text, name, category, created_at, created_by 
        FROM material_subcategories 
        ORDER BY category ASC, name ASC
      `);

      res.json({ subcategories: result.rows });
    } catch (err) {
      console.error("/api/subcategories-admin error", err);
      res.status(500).json({ message: "failed to list subcategories" });
    }
  });

  // GET /api/sidebar-subcategories - List all subcategories for sidebar (predefined + database)
  app.get("/api/sidebar-subcategories", async (_req, res) => {
    try {
      // Predefined subcategories with their routes and icons
      const predefinedSubcategories = [
        { id: "1", name: "Civil", href: "/estimators/civil-wall", icon: "BrickWall", category: "Estimators" },
        { id: "2", name: "Doors", href: "/estimators/doors", icon: "DoorOpen", category: "Estimators" },
        { id: "3", name: "False Ceiling", href: "/estimators/false-ceiling", icon: "Cloud", category: "Estimators" },
        { id: "4", name: "Flooring", href: "/estimators/flooring", icon: "Layers", category: "Estimators" },
        { id: "5", name: "Painting", href: "/estimators/painting", icon: "PaintBucket", category: "Estimators" },
        { id: "6", name: "Blinds", href: "/estimators/blinds", icon: "Blinds", category: "Estimators" },
        { id: "7", name: "Electrical", href: "/estimators/electrical", icon: "Zap", category: "Estimators" },
        { id: "8", name: "Plumbing", href: "/estimators/plumbing", icon: "Droplets", category: "Estimators" },
      ];

      // Get database subcategories (with trimming)
      const dbResult = await query(`
        SELECT DISTINCT TRIM(name) as name FROM material_subcategories 
        WHERE TRIM(name) != ''
        ORDER BY name ASC
      `);

      const dbSubcategoryNames = dbResult.rows.map((row) => row.name);

      // Create a set of predefined names (normalized for comparison)
      const predefinedNamesSet = new Set(
        predefinedSubcategories.map((p) => p.name.toLowerCase().trim())
      );

      // Filter out database entries that match predefined ones (case-insensitive and space-trim)
      const uniqueDbNames = dbSubcategoryNames.filter((dbName) => {
        const normalizedDbName = dbName.toLowerCase().trim();
        return !predefinedNamesSet.has(normalizedDbName);
      });

      // Combine: predefined first, then unique database entries
      const allSubcategories = [
        ...predefinedSubcategories,
        ...uniqueDbNames.map((name, idx) => ({
          id: `db_${idx}`,
          name: name,
          href: null,
          icon: "Layers",
          category: "Database",
        })),
      ];

      res.json({ subcategories: allSubcategories });
    } catch (err) {
      console.error("/api/sidebar-subcategories error", err);
      res.status(500).json({ message: "failed to list sidebar subcategories" });
    }
  });

  // ====== PRODUCTS CRUD ======

  // POST /api/products - Create a new product (Admin/Software Team/Purchase Team/Pre Sales)
  app.post(
    "/api/products",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { name, subcategory, taxCodeType, taxCodeValue, hsn_code, sac_code } = req.body;
        console.log('/api/products POST body ->', { name, subcategory, taxCodeType, taxCodeValue, hsn_code, sac_code });

        if (!name) {
          res.status(400).json({ message: "Product name is required" });
          return;
        }

        if (!subcategory) {
          res.status(400).json({ message: "Subcategory is required" });
          return;
        }

        const result = await query(
          `
        INSERT INTO products (name, subcategory, tax_code_type, tax_code_value, hsn_code, sac_code, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
          [name, subcategory || null, taxCodeType || null, taxCodeValue || null, hsn_code || null, sac_code || null, req.user?.username || "unknown"],
        );
        console.log('/api/products POST inserted ->', result.rows[0]);

        res.status(201).json({ product: result.rows[0] });
      } catch (err: any) {
        console.error("/api/products POST error", err);
        if (err.code === "23505") {
          // unique violation
          res.status(409).json({ message: "Product name already exists" });
        } else {
          res.status(500).json({ message: "Failed to create product" });
        }
      }
    },
  );

  // GET /api/products - List all products
  app.get("/api/products", async (_req, res) => {
    try {
      const result = await query(`
        SELECT
          p.*,
          s.name as subcategory_name,
          c.name as category_name
        FROM products p
        LEFT JOIN material_subcategories s ON LOWER(TRIM(p.subcategory)) = LOWER(TRIM(s.name))
        LEFT JOIN material_categories c ON LOWER(TRIM(s.category)) = LOWER(TRIM(c.name))
        ORDER BY p.created_at DESC
      `);

      res.json({ products: result.rows });
    } catch (err) {
      console.error("/api/products GET error", err);
      res.status(500).json({ message: "Failed to list products" });
    }
  });

  // PUT /api/products/:id - Update a product
  app.put(
    "/api/products/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name, subcategory, taxCodeType, taxCodeValue, hsn_code, sac_code, hsnCode, sacCode } = req.body;

        // Support both hsn_code (db style) and hsnCode (frontend style)
        // Prioritize camelCase (hsnCode/sacCode) if both are present to reflect latest frontend intent
        const finalHsnCode = hsnCode !== undefined ? hsnCode : hsn_code;
        const finalSacCode = sacCode !== undefined ? sacCode : sac_code;

        console.log(`/api/products/${id} PUT body ->`, { name, subcategory, hsn_code: finalHsnCode, sac_code: finalSacCode });

        if (!name) {
          res.status(400).json({ message: "Product name is required" });
          return;
        }

        if (!subcategory) {
          res.status(400).json({ message: "Subcategory is required" });
          return;
        }

        const result = await query(
          `
        UPDATE products 
        SET name = $1, subcategory = $2, tax_code_type = $3, tax_code_value = $4, hsn_code = $5, sac_code = $6
        WHERE id = $7
        RETURNING *
      `,
          [name, subcategory, taxCodeType || null, taxCodeValue || null, finalHsnCode || null, finalSacCode || null, id],
        );
        console.log(`/api/products/${id} PUT updated ->`, result.rows[0]);

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Product not found" });
          return;
        }

        res.json({ product: result.rows[0] });
      } catch (err: any) {
        console.error("/api/products PUT error", err);
        if (err.code === "23505") {
          res.status(409).json({ message: "Product name already exists" });
        } else {
          res.status(500).json({ message: "Failed to update product" });
        }
      }
    },
  );

  // DELETE /api/products/:id - Delete a product
  app.delete(
    "/api/products/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales", "product_manager"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const result = await query(
          "DELETE FROM products WHERE id = $1 RETURNING *",
          [id],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Product not found" });
          return;
        }

        res.json({ message: "Product deleted", product: result.rows[0] });
      } catch (err) {
        console.error("/api/products DELETE error", err);
        res.status(500).json({ message: "Failed to delete product" });
      }
    },
  );

  // GET /api/products/:id - Get a single product by ID
  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await query(
        `
        SELECT
          p.*,
          s.name as subcategory_name,
          c.name as category_name
        FROM products p
        LEFT JOIN material_subcategories s ON p.subcategory = s.name
        LEFT JOIN material_categories c ON s.category = c.name
        WHERE p.id = $1
      `,
        [id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ message: "Product not found" });
        return;
      }

      res.json({ product: result.rows[0] });
    } catch (err) {
      console.error("/api/products/:id GET error", err);
      res.status(500).json({ message: "Failed to get product" });
    }
  });

  // ====== MATERIAL SUBMISSIONS ======

  // POST /api/material-submissions - Submit a material for approval
  app.post(
    "/api/material-submissions",
    authMiddleware,
    requireRole("supplier", "purchase_team", "admin"),
    async (req: Request, res: Response) => {
      try {
        let {
          template_id,
          shop_id,
          rate,
          unit,
          brandname,
          modelnumber,
          subcategory,
          category,
          product,
          technicalspecification,
          dimensions,
          finishtype,
          metaltype,
        } = req.body;

        // Ensure template_id provided
        if (!template_id) {
          res.status(400).json({ message: "template_id is required" });
          return;
        }

        // If shop_id not provided and the requester is a supplier, auto-select their primary shop
        if (!shop_id && (req as any).user?.role === "supplier") {
          try {
            const ownerId = (req as any).user?.id;
            const shopsResult = await query(
              "SELECT id FROM shops WHERE owner_id = $1 ORDER BY created_at DESC",
              [ownerId],
            );
            if (shopsResult.rows.length === 0) {
              res.status(400).json({ message: "No shop found for supplier. Please create a shop first." });
              return;
            }
            shop_id = shopsResult.rows[0].id;
          } catch (err) {
            console.error("/api/material-submissions - failed to lookup supplier shop", err);
            res.status(500).json({ message: "failed to determine supplier shop" });
            return;
          }
        }

        if (!shop_id) {
          res.status(400).json({ message: "shop_id is required" });
          return;
        }

        const id = randomUUID();
        const result = await query(
          `INSERT INTO material_submissions (id, template_id, shop_id, rate, unit, brandname, modelnumber, subcategory, category, product, technicalspecification, dimensions, finishtype, metaltype, submitted_by, submitted_at, approved)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NULL)
           RETURNING *`,
          [
            id,
            template_id,
            shop_id,
            rate,
            unit,
            brandname || null,
            modelnumber || null,
            subcategory || null,
            category || null,
            product || null,
            technicalspecification || null,
            dimensions || null,
            finishtype || null,
            metaltype || null,
            (req as any).user?.id,
          ],
        );

        res.status(201).json({ submission: result.rows[0] });
      } catch (err: any) {
        console.error("/api/material-submissions POST error", err);
        res.status(500).json({ message: "failed to submit material" });
      }
    },
  );

  // GET /api/supplier/my-shops - Get shops owned by the current supplier
  app.get(
    "/api/supplier/my-shops",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        if (!userId) {
          return res
            .status(401)
            .json({ message: "Unauthorized: user not authenticated" });
        }

        // Get shops owned by this user
        const result = await query(
          "SELECT * FROM shops WHERE owner_id = $1 ORDER BY created_at DESC",
          [userId],
        );

        res.json({ shops: result.rows });
      } catch (err: any) {
        console.error("/api/supplier/my-shops error", err);
        res.status(500).json({ message: "failed to get shops" });
      }
    },
  );

  // GET /api/supplier/my-submissions - Get submissions for the current supplier/purchase_team/admin user
  app.get(
    "/api/supplier/my-submissions",
    authMiddleware,
    requireRole("supplier", "purchase_team", "admin"),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.id;
        console.log(
          "[supplier/my-submissions] fetching shops for user:",
          userId,
        );

        // Get shops owned by this user
        const shopsResult = await query(
          "SELECT id as shop_id FROM shops WHERE owner_id = $1",
          [userId],
        );
        const shopIds = shopsResult.rows.map((row: any) => row.shop_id);

        if (shopIds.length === 0) {
          return res.json({ submissions: [] });
        }

        // Get submissions for these shops
        const result = await query(
          `SELECT ms.*, mt.name as template_name, mt.code as template_code, mt.category, s.name as shop_name
           FROM material_submissions ms
           JOIN material_templates mt ON ms.template_id = mt.id
           JOIN shops s ON ms.shop_id = s.id
           WHERE ms.shop_id = ANY($1)
           ORDER BY ms.submitted_at DESC`,
          [shopIds],
        );

        const submissions = result.rows.map((row: any) => ({
          id: row.id,
          status:
            row.approved === true
              ? "approved"
              : row.approved === false
                ? "rejected"
                : "pending",
          submission: row,
        }));

        res.json({ submissions });
      } catch (err: any) {
        console.error("/api/supplier/my-submissions error", err);
        res.status(500).json({ message: "failed to get submissions" });
      }
    },
  );

  // GET /api/material-submissions-pending-approval - List pending material submissions (Admin/Software/Purchase)
  app.get(
    "/api/material-submissions-pending-approval",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (_req, res) => {
      try {
        const result = await query(`
          SELECT ms.*, mt.name as template_name, mt.code as template_code, mt.category as template_category, s.name as shop_name, u.username as submitted_by_username
          FROM material_submissions ms
          JOIN material_templates mt ON ms.template_id = mt.id
          JOIN shops s ON ms.shop_id = s.id
          LEFT JOIN users u ON ms.submitted_by = u.id
          WHERE ms.approved IS NULL
          ORDER BY ms.submitted_at DESC
        `);

        const submissions = result.rows.map((row: any) => ({
          id: row.id,
          status: "pending",
          submission: row,
        }));

        res.json({ submissions });
      } catch (err) {
        console.error("/api/material-submissions-pending-approval error", err);
        res
          .status(500)
          .json({ message: "failed to list pending material submissions" });
      }
    },
  );

  // POST /api/material-submissions/:id/approve - Approve a material submission
  app.post(
    "/api/material-submissions/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const submissionResult = await query(
          "SELECT * FROM material_submissions WHERE id = $1",
          [id],
        );

        if (submissionResult.rows.length === 0) {
          res.status(404).json({ message: "Submission not found" });
          return;
        }

        const submission = submissionResult.rows[0];
        const templateResult = await query(
          "SELECT * FROM material_templates WHERE id = $1",
          [submission.template_id],
        );
        const template = templateResult.rows[0];

        const materialId = randomUUID();
        await query(
          `INSERT INTO materials (id, name, code, rate, shop_id, unit, category, brandname, modelnumber, subcategory, product, technicalspecification, template_id, approved)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)`,
          [
            materialId,
            template.name,
            template.code,
            submission.rate,
            submission.shop_id,
            submission.unit,
            template.category,
            submission.brandname,
            submission.modelnumber,
            submission.subcategory,
            submission.product,
            submission.technicalspecification,
            submission.template_id,
          ],
        );

        const updateResult = await query(
          "UPDATE material_submissions SET approved = true WHERE id = $1 RETURNING *",
          [id],
        );

        res.json({
          submission: updateResult.rows[0],
          material: { id: materialId },
        });
      } catch (err: any) {
        console.error("/api/material-submissions/:id/approve error", err);
        res
          .status(500)
          .json({ message: "failed to approve material submission" });
      }
    },
  );

  // POST /api/material-submissions/:id/reject - Reject a material submission
  app.post(
    "/api/material-submissions/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const reason = req.body?.reason || null;

        const result = await query(
          "UPDATE material_submissions SET approved = false, approval_reason = $2 WHERE id = $1 RETURNING *",
          [id, reason],
        );

        res.json({ submission: result.rows[0] });
      } catch (err: any) {
        console.error("/api/material-submissions/:id/reject error", err);
        res
          .status(500)
          .json({ message: "failed to reject material submission" });
      }
    },
  );

  // GET /api/accumulated-products/:estimator_type - Get accumulated products for user and estimator
  app.get(
    "/api/accumulated-products/:estimator_type",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator_type } = req.params;
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const result = await query(
          "SELECT data FROM accumulated_products WHERE user_id = $1 AND estimator_type = $2 ORDER BY created_at DESC LIMIT 1",
          [userId, estimator_type],
        );

        if (result.rows.length === 0) {
          res.json({ data: [] });
          return;
        }

        res.json({ data: result.rows[0].data });
      } catch (err) {
        console.error("GET /api/accumulated-products error", err);
        res.status(500).json({ message: "Failed to get accumulated products" });
      }
    },
  );

  // POST /api/accumulated-products/:estimator_type - Save accumulated products
  app.post(
    "/api/accumulated-products/:estimator_type",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator_type } = req.params;
        const userId = (req as any).user?.id;
        if (!userId) return res.status(401).json({ message: "Unauthorized" });
        const data = req.body.data;

        // Upsert: delete existing and insert new
        await query(
          "DELETE FROM accumulated_products WHERE user_id = $1 AND estimator_type = $2",
          [userId, estimator_type],
        );
        await query(
          "INSERT INTO accumulated_products (user_id, estimator_type, data) VALUES ($1, $2, $3)",
          [userId, estimator_type, JSON.stringify(data)],
        );

        res.json({ message: "Accumulated products saved" });
      } catch (err) {
        console.error("POST /api/accumulated-products error", err);
        res
          .status(500)
          .json({ message: "Failed to save accumulated products" });
      }
    },
  );

  // ====== BOQ PROJECTS ROUTES ======

  // POST /api/boq-projects - Create a new BOQ project
  app.post(
    "/api/boq-projects",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { name, client, budget, location, client_address, gst_no, project_value } = req.body;
        console.log('/api/boq-projects POST body ->', { name, client, budget, location, client_address, gst_no, project_value });

        if (!name || !name.trim()) {
          res.status(400).json({ message: "Project name is required" });
          return;
        }

        const projectId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        await query(
          `INSERT INTO boq_projects (id, name, client, budget, location, client_address, gst_no, project_value, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
          [projectId, name.trim(), client || "", budget || "", location || null, client_address || null, gst_no || null, project_value || null, "draft"],
        );

        res.json({
          id: projectId,
          name: name.trim(),
          client: client || "",
          budget: budget || "",
          location: location || "",
          client_address: client_address || "",
          gst_no: gst_no || "",
          project_value: project_value || "",
          status: "draft",
        });
      } catch (err) {
        console.error("POST /api/boq-projects error", err);
        res.status(500).json({ message: "Failed to create project" });
      }
    },
  );

  // GET /api/boq-projects - List all BOQ projects
  app.get(
    "/api/boq-projects",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const result = await query(
          `SELECT id, name, client, budget, location, client_address, gst_no, project_value, status, created_at, updated_at FROM boq_projects ORDER BY created_at DESC`,
        );

        res.json({ projects: result.rows || [] });
      } catch (err) {
        console.error("GET /api/boq-projects error", err);
        res.status(500).json({ message: "Failed to fetch projects" });
      }
    },
  );

  // GET /api/boq-projects/:projectId - Get a specific project
  app.get(
    "/api/boq-projects/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;

        const result = await query(
          `SELECT id, name, client, budget, location, client_address, gst_no, project_value, status, created_at, updated_at FROM boq_projects WHERE id = $1`,
          [projectId],
        );

        if (result.rows.length === 0) {
          res.status(404).json({ message: "Project not found" });
          return;
        }

        res.json(result.rows[0]);
      } catch (err) {
        console.error("GET /api/boq-projects/:projectId error", err);
        res.status(500).json({ message: "Failed to fetch project" });
      }
    },
  );

  // PUT /api/boq-projects/:projectId - Update project status
  app.put(
    "/api/boq-projects/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;
        const { status } = req.body;

        if (!status || !["draft", "submitted", "finalized"].includes(status)) {
          res.status(400).json({ message: "Invalid status" });
          return;
        }

        await query(
          `UPDATE boq_projects SET status = $1, updated_at = NOW() WHERE id = $2`,
          [status, projectId],
        );

        res.json({ message: "Project updated" });
      } catch (err) {
        console.error("PUT /api/boq-projects/:projectId error", err);
        res.status(500).json({ message: "Failed to update project" });
      }
    },
  );

  // DELETE /api/boq-projects/:projectId - Delete a project
  app.delete(
    "/api/boq-projects/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;

        // First, delete all items related to this project
        await query(`DELETE FROM boq_items WHERE project_id = $1`, [projectId]);

        // Then delete all versions related to this project
        await query(`DELETE FROM boq_versions WHERE project_id = $1`, [projectId]);

        // Finally delete the project itself
        const result = await query(
          `DELETE FROM boq_projects WHERE id = $1`,
          [projectId],
        );

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Project not found" });
          return;
        }

        res.json({ message: "Project deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/boq-projects/:projectId error", err);
        res.status(500).json({ message: "Failed to delete project" });
      }
    },
  );

  // ====== BOQ VERSIONS ROUTES ======

  // GET /api/boq-versions/:projectId - List all versions of a project
  app.get(
    "/api/boq-versions/:projectId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;

        const result = await query(
          `SELECT id, project_id, project_name, project_client, project_location, version_number, status, created_at, updated_at 
           FROM boq_versions 
           WHERE project_id = $1 
           ORDER BY version_number DESC`,
          [projectId],
        );

        res.json({ versions: result.rows || [] });
      } catch (err) {
        console.error("GET /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to fetch versions" });
      }
    },
  );

  // POST /api/boq-versions - Create a new version
  app.post(
    "/api/boq-versions",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { project_id, copy_from_version } = req.body;

        if (!project_id) {
          res.status(400).json({ message: "project_id is required" });
          return;
        }

        // Get next version number
        const versionResult = await query(
          `SELECT MAX(version_number) as max_version FROM boq_versions WHERE project_id = $1`,
          [project_id],
        );

        const nextVersion = (versionResult.rows[0]?.max_version || 0) + 1;
        const versionId = `ver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Fetch project name/client/location so we can store them on the version
        let projectName: string | null = null;
        let projectClient: string | null = null;
        let projectLocation: string | null = null;
        try {
          const proj = await query(`SELECT name, client, location FROM boq_projects WHERE id = $1`, [project_id]);
          projectName = proj.rows[0]?.name ?? null;
          projectClient = proj.rows[0]?.client ?? null;
          projectLocation = proj.rows[0]?.location ?? null;
        } catch (err) {
          // non-fatal: proceed with nulls if lookup fails
          console.warn("[db] Could not fetch project name/client/location:", (err as any)?.message || err);
        }

        // Create new version (store project name, client, location for easier querying/version display)
        // Also copy column_config from previous version if expanding from one
        let initialColumnConfig = null;
        if (copy_from_version) {
          const prevVer = await query("SELECT column_config FROM boq_versions WHERE id = $1", [copy_from_version]);
          if (prevVer.rows.length > 0) {
            initialColumnConfig = prevVer.rows[0].column_config;
          }
        }

        await query(
          `INSERT INTO boq_versions (id, project_id, project_name, project_client, project_location, version_number, status, column_config, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
          [versionId, project_id, projectName, projectClient, projectLocation, nextVersion, "draft", initialColumnConfig],
        );

        // Copy items from previous version if requested
        if (copy_from_version) {
          const itemsResult = await query(
            `SELECT * FROM boq_items WHERE version_id = $1 ORDER BY sort_order ASC, created_at ASC`,
            [copy_from_version],
          );

          for (const item of itemsResult.rows) {
            const newItemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await query(
              `INSERT INTO boq_items (id, project_id, estimator, table_data, version_id, sort_order, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
              [
                newItemId,
                project_id,
                item.estimator,
                item.table_data,
                versionId,
                item.sort_order, // Copy sort_order
              ],
            );
          }
        }

        res.json({
          id: versionId,
          project_id,
          version_number: nextVersion,
          status: "draft",
        });
      } catch (err) {
        console.error("POST /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to create version" });
      }
    },
  );

  // POST /api/boq-versions/:versionId/save-edits - Batch save edits for BOQ items in a version
  app.post(
    "/api/boq-versions/:versionId/save-edits",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;
        const { editedFields } = req.body;

        if (!editedFields || Object.keys(editedFields).length === 0) {
          return res.json({ message: "No edits to save" });
        }

        console.log(`Saving edits for version ${versionId}:`, Object.keys(editedFields));

        // Group edits by boqItemId
        const editsByItem: Record<string, Record<number, any>> = {};
        for (const [key, fields] of Object.entries(editedFields)) {
          const lastDashIndex = key.lastIndexOf("-");
          if (lastDashIndex === -1) {
            console.warn(`[save-edits] Invalid edit key format: ${key}`);
            continue;
          }
          let boqItemId = key.substring(0, lastDashIndex).trim();
          const itemIdxStr = key.substring(lastDashIndex + 1);
          const itemIdx = parseInt(itemIdxStr, 10);

          // If the key contains "-manual", strip it to find the real boqItemId
          if (boqItemId.endsWith("-manual")) {
            boqItemId = boqItemId.substring(0, boqItemId.length - 7);
          }

          if (!editsByItem[boqItemId]) editsByItem[boqItemId] = {};
          editsByItem[boqItemId][itemIdx] = fields;
        }

        console.log("Grouped edits by BOQ Item ID:", Object.keys(editsByItem));

        // Process each BOQ item that has edits
        let totalItemsUpdated = 0;
        const updatedRows: any[] = [];

        for (const [boqItemId, itemEdits] of Object.entries(editsByItem)) {
          console.log(`Processing edits for BOQ Item ID: ${boqItemId}`);

          // Fetch existing item
          const result = await query(
            `SELECT table_data FROM boq_items WHERE id = $1`,
            [boqItemId]
          );

          if (result.rows.length === 0) {
            console.warn(`BOQ item ${boqItemId} NOT FOUND in version ${versionId}`);
            continue;
          }

          let tableData = result.rows[0].table_data;
          if (typeof tableData === "string") {
            try {
              tableData = JSON.parse(tableData);
            } catch (e) {
              console.error(`Failed to parse table_data string for item ${boqItemId}`, e);
              continue;
            }
          }

          if (!tableData || !tableData.step11_items || !Array.isArray(tableData.step11_items)) {
            console.warn(`BOQ item ${boqItemId} has no valid step11_items array`, tableData);
            continue;
          }

          // Apply edits to step11_items array
          let editsAppliedToThisItem = 0;
          for (const [itemIdxStr, fields] of Object.entries(itemEdits)) {
            const itemIdx = parseInt(itemIdxStr, 10);
            if (tableData.step11_items[itemIdx]) {
              console.log(`Applying edits to sub-item index ${itemIdx} of BOQ Item ${boqItemId}`);
              tableData.step11_items[itemIdx] = {
                ...tableData.step11_items[itemIdx],
                ...fields as any
              };
              editsAppliedToThisItem++;
            } else {
              console.warn(`Sub-item index ${itemIdx} NOT FOUND in step11_items of BOQ Item ${boqItemId}`);
            }
          }

          if (editsAppliedToThisItem > 0) {
            // Update DB with modified table_data object directly
            const updateResult = await query(
              `UPDATE boq_items SET table_data = $1 WHERE id = $2`,
              [tableData, boqItemId]
            );
            console.log(`[save-edits] DB UPDATE SUCCESS for ${boqItemId}. Rows affected: ${updateResult.rowCount}`);

            // Fetch the updated row so we can return authoritative data to the client
            try {
              const fresh = await query(
                `SELECT id, project_id, version_id, estimator, table_data, created_at FROM boq_items WHERE id = $1`,
                [boqItemId],
              );
              if (fresh.rows.length > 0) {
                const row = fresh.rows[0];
                updatedRows.push({
                  id: row.id,
                  project_id: row.project_id,
                  version_id: row.version_id,
                  estimator: row.estimator,
                  table_data: typeof row.table_data === "string" ? JSON.parse(row.table_data) : row.table_data,
                  created_at: row.created_at,
                });
              }
            } catch (e) {
              console.warn(`[save-edits] Failed to re-select updated row ${boqItemId}:`, e);
            }

            totalItemsUpdated++;
          }
        }

        console.log(`Successfully finished saving edits. Total BOQ items updated: ${totalItemsUpdated}`);

        // Log edit in history
        if (totalItemsUpdated > 0) {
          try {
            const user = (req as any).user;
            await query(
              `INSERT INTO boq_history (version_id, user_id, user_full_name, action, created_at)
               VALUES ($1, $2, $3, 'edited', NOW())`,
              [versionId, user?.id, user?.fullName || user?.username]
            );
          } catch (hErr) {
            console.warn("Failed to log edit history:", hErr);
          }
        }

        res.json({ message: "Edits saved successfully", updatedItems: updatedRows });
      } catch (err) {
        console.error("POST /api/boq-versions/:versionId/save-edits error", err);
        res.status(500).json({ message: "Failed to save edits" });
      }
    },
  );

  // GET /api/boq-versions/:versionId/history - Fetch history for a version
  app.get(
    "/api/boq-versions/:versionId/history",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;
        const result = await query(
          "SELECT * FROM boq_history WHERE version_id = $1 ORDER BY created_at DESC",
          [versionId]
        );
        res.json({ history: result.rows });
      } catch (err) {
        console.error("GET /api/boq-versions/:versionId/history error", err);
        res.status(500).json({ message: "Failed to fetch history" });
      }
    }
  );

  // PUT /api/boq-versions/:versionId - Update version status (lock/submit)
  app.put(
    "/api/boq-versions/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;
        const { status } = req.body;



        if (status && !["draft", "submitted", "pending_approval", "approved", "rejected"].includes(status)) {
          res.status(400).json({ message: "Invalid status" });
          return;
        }

        if (!status && req.body.column_config === undefined) {
          // allow updating just column_config without status
        }


        if (req.body.column_config !== undefined) {
          await query(
            `UPDATE boq_versions SET column_config = $1, updated_at = NOW() WHERE id = $2`,
            [req.body.column_config, versionId]
          );
        }

        if (status) {
          await query(
            `UPDATE boq_versions SET status = $1, updated_at = NOW() WHERE id = $2`,
            [status, versionId],
          );

          // Log status change in history
          try {
            const user = (req as any).user;
            await query(
              `INSERT INTO boq_history (version_id, user_id, user_full_name, action, created_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [versionId, user?.id, user?.fullName || user?.username, status]
            );
          } catch (hErr) {
            console.warn("Failed to log status history:", hErr);
          }
        }

        res.json({ message: "Version updated" });
      } catch (err) {
        console.error("PUT /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to update version" });
      }
    },
  );

  // ==================== BOM APPROVAL ROUTES ====================

  // GET /api/bom-approvals - List all submitted BOM versions
  app.get(
    "/api/bom-approvals",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (_req: Request, res: Response) => {
      try {
        const result = await query(
          "SELECT * FROM boq_versions WHERE status != 'draft' AND created_at >= '2026-03-02 00:00:00' ORDER BY created_at DESC"
        );
        res.json({ approvals: result.rows });
      } catch (err) {
        console.error("GET /api/bom-approvals error:", err);
        res.status(500).json({ message: "Failed to load BOM approval requests" });
      }
    }
  );

  // POST /api/bom-approvals/:id/approve - Approve a BOM version
  app.post(
    "/api/bom-approvals/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        await query(
          "UPDATE boq_versions SET status = 'approved', updated_at = NOW() WHERE id = $1",
          [id]
        );

        // Log approval in history
        try {
          const user = (req as any).user;
          await query(
            `INSERT INTO boq_history (version_id, user_id, user_full_name, action, created_at)
             VALUES ($1, $2, $3, 'approved', NOW())`,
            [id, user?.id, user?.fullName || user?.username]
          );
        } catch (hErr) {
          console.warn("Failed to log approval history:", hErr);
        }
        res.json({ message: "BOM version approved successfully" });
      } catch (err) {
        console.error("POST /api/bom-approvals/:id/approve error:", err);
        res.status(500).json({ message: "Failed to approve BOM version" });
      }
    }
  );

  // POST /api/bom-approvals/:id/reject - Reject a BOM version
  app.post(
    "/api/bom-approvals/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { reason } = req.body;
        await query(
          "UPDATE boq_versions SET status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2",
          [reason, id]
        );

        // Log rejection in history
        try {
          const user = (req as any).user;
          await query(
            `INSERT INTO boq_history (version_id, user_id, user_full_name, action, reason, created_at)
             VALUES ($1, $2, $3, 'rejected', $4, NOW())`,
            [id, user?.id, user?.fullName || user?.username, reason]
          );
        } catch (hErr) {
          console.warn("Failed to log rejection history:", hErr);
        }
        res.json({ message: "BOM version rejected successfully" });
      } catch (err) {
        console.error("POST /api/bom-approvals/:id/reject error:", err);
        res.status(500).json({ message: "Failed to reject BOM version" });
      }
    }
  );

  // GET /api/boq-versions/:versionId - Get a specific version
  app.get(
    "/api/boq-versions/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;
        const result = await query("SELECT * FROM boq_versions WHERE id = $1", [versionId]);

        if (result.rows.length === 0) {
          return res.status(404).json({ message: "Version not found" });
        }

        res.json(result.rows[0]);
      } catch (err) {
        console.error("GET /api/boq-versions/:versionId error", err);
        res.status(500).json({ message: "Failed to fetch version" });
      }
    }
  );

  // DELETE /api/boq-versions/:versionId - Delete a version and its items
  app.delete(
    "/api/boq-versions/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      const client = await (query as any).client?.connect?.();
      const { versionId } = req.params;

      try {
        // Use transaction to ensure both deletes succeed together
        await query("BEGIN");

        // Delete BOQ items tied to this version
        await query(`DELETE FROM boq_items WHERE version_id = $1`, [versionId]);

        // Delete the version itself
        await query(`DELETE FROM boq_versions WHERE id = $1`, [versionId]);

        await query("COMMIT");

        res.json({ message: "Version and its items deleted" });
      } catch (err) {
        try {
          await query("ROLLBACK");
        } catch (e) {
          // ignore
        }
        console.error("DELETE /api/boq-versions error", err);
        res.status(500).json({ message: "Failed to delete version" });
      } finally {
        if (client && typeof client.release === "function") client.release();
      }
    },
  );

  // ====== BOQ ITEMS ROUTES ======

  // POST /api/boq-items - Save a new BOQ item (captured from estimator Step 9)
  app.post(
    "/api/boq-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { project_id, version_id, estimator, table_data } = req.body;
        console.log("POST /api/boq-items received:", {
          project_id,
          version_id,
          estimator,
          table_data_keys: table_data ? Object.keys(table_data) : null,
        });

        if (!project_id || !estimator || !table_data) {
          console.error("Missing required fields:", {
            has_project_id: !!project_id,
            has_estimator: !!estimator,
            has_table_data: !!table_data,
          });
          res.status(400).json({
            message: "project_id, estimator, and table_data are required",
          });
          return;
        }

        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log("Creating BOQ item with ID:", itemId);

        // Determine the next sort_order for this version
        const maxSortOrderResult = await query(
          `SELECT MAX(sort_order) as max_sort_order FROM boq_items WHERE version_id = $1`,
          [version_id],
        );
        const nextSortOrder = (maxSortOrderResult.rows[0]?.max_sort_order || 0) + 1;

        await query(
          `INSERT INTO boq_items (id, project_id, estimator, table_data, version_id, user_added, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, true, $6, NOW())`,
          [
            itemId,
            project_id,
            estimator,
            JSON.stringify(table_data),
            version_id || null,
            nextSortOrder,
          ],
        );

        // Confirm row persisted by selecting it back
        try {
          const check = await query(
            `SELECT id, project_id, version_id, estimator, table_data, user_added, sort_order, created_at FROM boq_items WHERE id = $1`,
            [itemId],
          );
          const inserted = check.rows[0];
          console.log("BOQ item created successfully (db):", {
            id: inserted?.id,
            project_id: inserted?.project_id,
            version_id: inserted?.version_id,
            estimator: inserted?.estimator,
            user_added: inserted?.user_added,
            sort_order: inserted?.sort_order,
            created_at: inserted?.created_at,
          });
        } catch (e) {
          console.warn("Could not verify inserted BOQ item:", e);
        }

        const responseData = {
          id: itemId,
          project_id,
          version_id,
          estimator,
          table_data,
          sort_order: nextSortOrder,
        };

        res.json(responseData);
      } catch (err) {
        console.error("POST /api/boq-items error", err);
        console.error("Error details:", {
          message: (err as any)?.message,
          code: (err as any)?.code,
          detail: (err as any)?.detail,
          stack: (err as any)?.stack,
        });
        res.status(500).json({
          message: "Failed to save BOQ item",
          error: (err as any)?.message
        });
      }
    },
  );

  // GET /api/boq-items/finalized - Fetch ALL finalized items
  app.get(
    "/api/boq-items/finalized",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        // Cast table_data to jsonb to query inside it. 
        // We use boolean check or string check depending on how it was stored.
        // The frontend stores `is_finalized: true` (boolean), so ->> returns 'true' string.
        const result = await query(
          `SELECT id, project_id, version_id, estimator, table_data, created_at 
           FROM boq_items 
           WHERE (table_data::jsonb)->>'is_finalized' = 'true'
           ORDER BY sort_order ASC, created_at DESC`, // Added sort_order
          [],
        );

        const items = result.rows.map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          version_id: row.version_id,
          estimator: row.estimator,
          table_data:
            typeof row.table_data === "string"
              ? JSON.parse(row.table_data)
              : row.table_data,
          created_at: row.created_at,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/boq-items/finalized error", err);
        res.status(500).json({ message: "Failed to fetch finalized items" });
      }
    },
  );

  // GET /api/boq-items/version/:versionId - Fetch BOQ items for a specific version
  app.get(
    "/api/boq-items/version/:versionId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { versionId } = req.params;

        const result = await query(
          `SELECT id, project_id, version_id, estimator, table_data, created_at 
         FROM boq_items 
         WHERE version_id = $1 AND user_added = true 
         ORDER BY sort_order ASC, created_at ASC`, // Added sort_order
          [versionId],
        );

        try {
          const ids = result.rows.map((r: any) => r.id).slice(0, 20);
          console.log(`GET /api/boq-items/version/${versionId} -> ${result.rows.length} items. ids(first20):`, ids);
        } catch (e) {
          // ignore logging errors
        }

        const items = result.rows.map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          version_id: row.version_id,
          estimator: row.estimator,
          table_data:
            typeof row.table_data === "string"
              ? JSON.parse(row.table_data)
              : row.table_data,
          created_at: row.created_at,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/boq-items/version error", err);
        res.status(500).json({ message: "Failed to fetch BOQ items" });
      }
    },
  );

  // POST /api/boq-items/reorder - Persist new sort order for BOM items
  app.post(
    "/api/boq-items/reorder",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "pre_sales"),
    async (req: Request, res: Response) => {
      try {
        const { itemIds } = req.body; // Expects array of item IDs in correct order
        if (!Array.isArray(itemIds)) {
          return res.status(400).json({ message: "itemIds array is required" });
        }

        console.log("Reordering items:", itemIds.length);

        // Update each item with its new sort order (index in the array)
        // Using a transaction for efficiency and safety
        await query("BEGIN");
        for (let i = 0; i < itemIds.length; i++) {
          await query(
            "UPDATE boq_items SET sort_order = $1 WHERE id = $2",
            [i, itemIds[i]]
          );
        }
        await query("COMMIT");

        res.json({ message: "Sort order updated successfully" });
      } catch (err: any) {
        await query("ROLLBACK");
        console.error("POST /api/boq-items/reorder error", err);
        res.status(500).json({ message: "Failed to update sort order" });
      }
    },
  );

  // GET /api/boq-items - Fetch BOQ items for a project (legacy, all versions)
  app.get(
    "/api/boq-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { project_id } = req.query;

        if (!project_id) {
          res
            .status(400)
            .json({ message: "project_id query parameter is required" });
          return;
        }

        const result = await query(
          `SELECT id, project_id, version_id, estimator, table_data, created_at FROM boq_items 
         WHERE project_id = $1 AND user_added = true ORDER BY created_at ASC`,
          [project_id],
        );

        const items = result.rows.map((row: any) => ({
          id: row.id,
          project_id: row.project_id,
          version_id: row.version_id,
          estimator: row.estimator,
          table_data:
            typeof row.table_data === "string"
              ? JSON.parse(row.table_data)
              : row.table_data,
          created_at: row.created_at,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/boq-items error", err);
        res.status(500).json({ message: "Failed to fetch BOQ items" });
      }
    },
  );

  // PUT /api/boq-items/:itemId - Update a BOQ item's table_data
  app.put(
    "/api/boq-items/:itemId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { itemId } = req.params;
        const { table_data } = req.body;

        if (!table_data) {
          res.status(400).json({ message: "table_data is required" });
          return;
        }

        await query(
          `UPDATE boq_items SET table_data = $1, created_at = NOW() WHERE id = $2`,
          [JSON.stringify(table_data), itemId],
        );

        res.json({ message: "BOQ item updated" });
      } catch (err) {
        console.error("PUT /api/boq-items/:itemId error", err);
        res.status(500).json({ message: "Failed to update BOQ item" });
      }
    },
  );

  // DELETE /api/boq-items/:itemId - Delete a BOQ item
  app.delete(
    "/api/boq-items/:itemId",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { itemId } = req.params;

        await query(`DELETE FROM boq_items WHERE id = $1`, [itemId]);

        res.json({ message: "BOQ item deleted" });
      } catch (err) {
        console.error("DELETE /api/boq-items/:itemId error", err);
        res.status(500).json({ message: "Failed to delete BOQ item" });
      }
    },
  );

  // ====== BOQ TEMPLATE ROUTES ======

  // GET /api/boq-templates - List all templates
  app.get("/api/boq-templates", authMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await query("SELECT * FROM boq_templates ORDER BY name ASC");
      res.json({ templates: result.rows });
    } catch (err) {
      console.error("GET /api/boq-templates error", err);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // POST /api/boq-templates - Save a new template
  app.post("/api/boq-templates", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { name, config } = req.body;
      if (!name || !config) {
        return res.status(400).json({ message: "Name and config are required" });
      }

      await query(
        `INSERT INTO boq_templates (name, config, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (name) DO UPDATE SET config = $2, updated_at = NOW()`,
        [name, JSON.stringify(config)]
      );

      res.json({ message: "Template saved successfully" });
    } catch (err) {
      console.error("POST /api/boq-templates error", err);
      res.status(500).json({ message: "Failed to save template" });
    }
  });

  // DELETE /api/boq-templates/:id - Delete a template
  app.delete("/api/boq-templates/:id", authMiddleware, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await query("DELETE FROM boq_templates WHERE id = $1", [id]);
      res.json({ message: "Template deleted" });
    } catch (err) {
      console.error("DELETE /api/boq-templates error", err);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Estimator Step Data Storage Routes
  app.post(
    "/api/estimator-step9-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator, session_id, items, replace } = req.body;
        const userId = (req as any).user?.id;

        if (!items || !Array.isArray(items)) {
          return res.status(400).json({ message: "Items array is required" });
        }

        // Ensure table exists
        await query(`
        CREATE TABLE IF NOT EXISTS estimator_step9_cart (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          estimator TEXT NOT NULL,
          bill_no TEXT NOT NULL,
          s_no INTEGER,
          item TEXT,
          description TEXT,
          unit TEXT,
          qty DECIMAL(10,2),
          rate DECIMAL(10,2),
          amount DECIMAL(10,2),
          material_id UUID,
          batch_id TEXT,
          row_id TEXT,
          shop_id UUID,
          supply_rate DECIMAL(10,2),
          install_rate DECIMAL(10,2),
          door_type TEXT,
          panel_type TEXT,
          sub_option TEXT,
          glazing_type TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

        // If replace is true, delete existing items for this session first
        if (replace) {
          await query(
            `
          DELETE FROM estimator_step9_cart
          WHERE estimator = $1 AND bill_no = $2
        `,
            [estimator, session_id],
          );
        }

        for (const item of items) {
          await query(
            `
          INSERT INTO estimator_step9_cart (
            estimator, bill_no, s_no, item, description, unit, qty, rate, amount,
            material_id, batch_id, row_id, shop_id, supply_rate, install_rate,
            door_type, panel_type, sub_option, glazing_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `,
            [
              estimator,
              session_id,
              item.s_no,
              item.name || item.item,
              item.description,
              item.unit,
              item.quantity || item.qty,
              (item.supply_rate || 0) + (item.install_rate || 0),
              (item.quantity || item.qty || 0) *
              ((item.supply_rate || 0) + (item.install_rate || 0)),
              item.material_id,
              item.batch_id,
              item.row_id,
              item.shop_id,
              item.supply_rate,
              item.install_rate,
              item.door_type,
              item.panel_type,
              item.sub_option,
              item.glazing_type,
            ],
          );
        }

        res.json({ message: "Step 9 items saved successfully" });
      } catch (err) {
        console.error("POST /api/estimator-step9-items error", err);
        res.status(500).json({ message: "Failed to save step 9 items" });
      }
    },
  );

  app.get(
    "/api/estimator-step9-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.query;

        // Ensure table exists
        await query(`
        CREATE TABLE IF NOT EXISTS estimator_step9_cart (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          estimator TEXT NOT NULL,
          bill_no TEXT NOT NULL,
          s_no INTEGER,
          item TEXT,
          description TEXT,
          unit TEXT,
          qty DECIMAL(10,2),
          rate DECIMAL(10,2),
          amount DECIMAL(10,2),
          material_id UUID,
          batch_id TEXT,
          row_id TEXT,
          shop_id UUID,
          supply_rate DECIMAL(10,2),
          install_rate DECIMAL(10,2),
          door_type TEXT,
          panel_type TEXT,
          sub_option TEXT,
          glazing_type TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

        let queryStr =
          "SELECT * FROM estimator_step9_cart WHERE estimator = $1";
        const params: any[] = [estimator];

        // If session_id is provided, filter by it; otherwise fetch all for that estimator
        if (session_id) {
          queryStr += " AND bill_no = $2";
          params.push(session_id);
        }

        queryStr += " ORDER BY created_at DESC";

        const result = await query(queryStr, params);

        // Transform the data to match frontend expectations
        const transformedItems = result.rows.map((row) => ({
          id: row.material_id,
          session_id: row.bill_no,
          rowId: row.row_id,
          batchId: row.batch_id,
          name: row.item,
          unit: row.unit,
          quantity: parseFloat(row.qty || 0),
          rate: parseFloat(row.rate || 0),
          supplyRate: parseFloat(row.supply_rate || 0),
          installRate: parseFloat(row.install_rate || 0),
          shopId: row.shop_id,
          material_name: row.item,
          shop_name: row.shop_name || "",
          description: row.description || "",
          location: row.location || "",
          doorType: row.door_type,
          panelType: row.panel_type,
          subOption: row.sub_option,
          glazingType: row.glazing_type,
          isSaved: true, // Mark as saved since it's from DB
          // Include database ID for deletion
          dbId: row.id,
        }));

        res.json({ items: transformedItems });
      } catch (err) {
        console.error("GET /api/estimator-step9-items error", err);
        res.status(500).json({ message: "Failed to load step 9 items" });
      }
    },
  );

  app.post(
    "/api/estimator-step11-groups",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { groups } = req.body;

        if (!groups || !Array.isArray(groups)) {
          return res.status(400).json({ message: "Groups array is required" });
        }

        for (const group of groups) {
          await query(
            `
          INSERT INTO estimator_step11_finalize_boq (
            estimator, bill_no, s_no, item, location, description, unit, qty,
            supply_rate, install_rate, supply_amount, install_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
            [
              group.estimator,
              group.session_id,
              group.s_no || null,
              group.item_name || group.item,
              group.location,
              group.description,
              group.unit,
              group.quantity || group.qty,
              group.supply_rate,
              group.install_rate,
              group.supply_amount,
              group.install_amount,
            ],
          );
        }

        res.json({ message: "Step 11 groups saved successfully" });
      } catch (err) {
        console.error("POST /api/estimator-step11-groups error", err);
        res.status(500).json({ message: "Failed to save step 11 groups" });
      }
    },
  );

  app.post(
    "/api/estimator-step12-qa-selection",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { estimator, session_id, items } = req.body;

        if (!items || !Array.isArray(items)) {
          return res.status(400).json({ message: "Items array is required" });
        }

        for (const item of items) {
          await query(
            `
          INSERT INTO estimator_step12_qa_boq (
            estimator, bill_no, s_no, item, location, description, unit, qty,
            supply_rate, install_rate, supply_amount, install_amount
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
            [
              estimator,
              session_id,
              item.s_no,
              item.item,
              item.location,
              item.description,
              item.unit,
              item.qty,
              item.supply_rate,
              item.install_rate,
              item.supply_amount,
              item.install_amount,
            ],
          );
        }

        res.json({ message: "Step 12 QA items saved successfully" });
      } catch (err) {
        console.error("POST /api/estimator-step12-qa-selection error", err);
        res.status(500).json({ message: "Failed to save step 12 QA items" });
      }
    },
  );

  app.get(
    "/api/estimator-step11-groups",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.query;

        const result = await query(
          `
        SELECT * FROM estimator_step11_finalize_boq 
        WHERE bill_no = $1 AND estimator = $2 
        ORDER BY s_no ASC
      `,
          [session_id, estimator],
        );

        res.json({ items: result.rows });
      } catch (err) {
        console.error("GET /api/estimator-step11-groups error", err);
        res.status(500).json({ message: "Failed to load step 11 groups" });
      }
    },
  );

  // GET /api/step11-by-product - Get Step 11 data for a product
  app.get(
    "/api/step11-by-product",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { product_id, estimator } = req.query;

        if (!product_id || !estimator) {
          return res.status(400).json({
            message: "product_id and estimator query parameters are required",
          });
        }

        // First, get the product details to find matching items
        const productResult = await query(
          `SELECT name FROM products WHERE id = $1`,
          [product_id],
        );

        if (productResult.rows.length === 0) {
          return res.json({ items: [] });
        }

        const product = productResult.rows[0];
        const productName = product.name.toLowerCase();

        // Query estimator_step11_finalize_boq table
        // Filter by estimator AND match product keywords
        const result = await query(
          `
        SELECT 
          id, bill_no, estimator, s_no, item, location, unit,
          qty, supply_rate, install_rate, supply_amount, install_amount, created_at
        FROM estimator_step11_finalize_boq 
        WHERE estimator = $1
        ORDER BY s_no ASC
        LIMIT 50
      `,
          [estimator],
        );

        // Filter items that match the product name with strict matching
        // Get the first significant word of the product name (e.g., "Flush" from "Flush Door")
        const productWords = productName.split(" ").filter((w: string) => w.length > 2);
        const primaryWord = productWords[0]; // e.g., "flush" or "glass"

        const filteredRows = result.rows.filter((row: any) => {
          const itemLower = row.item?.toLowerCase() || "";

          // Match ONLY if item starts with the primary product word
          // This ensures "Flush Door" items only match "flush*" and "Glass Door" only matches "glass*"
          return itemLower.startsWith(primaryWord);
        });

        // If no matches found, return empty (don't return all items)
        if (filteredRows.length === 0) {
          return res.json({ items: [] });
        }

        // Transform data to match Step 11Preview expectations
        const items = filteredRows.map((row: any) => ({
          id: row.id || `${row.bill_no}-${row.s_no}`,
          s_no: row.s_no,
          bill_no: row.bill_no,
          estimator: row.estimator,
          title: row.item,
          description: row.item, // Use item as description since description column may not exist
          location: row.location,
          unit: row.unit,
          qty: parseFloat(row.qty || 0),
          supply_rate: parseFloat(row.supply_rate || 0),
          install_rate: parseFloat(row.install_rate || 0),
          supply_amount: parseFloat(row.supply_amount || 0),
          install_amount: parseFloat(row.install_amount || 0),
          group_id: row.bill_no,
        }));

        res.json({ items });
      } catch (err) {
        console.error("GET /api/step11-by-product error", err);
        res.status(500).json({ message: "Failed to load step 11 data" });
      }
    },
  );

  app.get(
    "/api/estimator-step12-qa-selection",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.query;

        const result = await query(
          `
        SELECT * FROM estimator_step12_qa_boq 
        WHERE bill_no = $1 AND estimator = $2 
        ORDER BY s_no ASC
      `,
          [session_id, estimator],
        );

        res.json({ items: result.rows });
      } catch (err) {
        console.error("GET /api/estimator-step12-qa-selection error", err);
        res.status(500).json({ message: "Failed to load step 12 QA items" });
      }
    },
  );

  app.delete(
    "/api/estimator-step9-items",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator, items } = req.body;

        // Ensure table exists
        await query(`
        CREATE TABLE IF NOT EXISTS estimator_step9_cart (
          id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
          estimator TEXT NOT NULL,
          bill_no TEXT NOT NULL,
          s_no INTEGER,
          item TEXT,
          description TEXT,
          unit TEXT,
          qty DECIMAL(10,2),
          rate DECIMAL(10,2),
          amount DECIMAL(10,2),
          material_id UUID,
          batch_id TEXT,
          row_id TEXT,
          shop_id UUID,
          supply_rate DECIMAL(10,2),
          install_rate DECIMAL(10,2),
          door_type TEXT,
          panel_type TEXT,
          sub_option TEXT,
          glazing_type TEXT,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);

        if (items && Array.isArray(items) && items.length > 0) {
          // Delete specific items by ID
          for (const item of items) {
            await query(
              `
            DELETE FROM estimator_step9_cart
            WHERE id = $1 AND bill_no = $2 AND estimator = $3
          `,
              [item.dbId || item.id, session_id, estimator],
            );
          }
        } else {
          // Delete all items for the session (backward compatibility)
          await query(
            `
          DELETE FROM estimator_step9_cart
          WHERE bill_no = $1 AND estimator = $2
        `,
            [session_id, estimator],
          );
        }

        res.json({ message: "Step 9 items deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/estimator-step9-items error", err);
        res.status(500).json({ message: "Failed to delete step 9 items" });
      }
    },
  );

  app.delete(
    "/api/estimator-step11-groups",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator, ids } = req.body;

        if (ids && Array.isArray(ids) && ids.length > 0) {
          // Delete specific items by IDs
          await query(
            `
          DELETE FROM estimator_step11_finalize_boq
          WHERE id = ANY($1) AND estimator = $2
        `,
            [ids, estimator],
          );
        } else if (session_id && estimator) {
          // Delete all items for a session (legacy behavior)
          await query(
            `
          DELETE FROM estimator_step11_finalize_boq
          WHERE bill_no = $1 AND estimator = $2
        `,
            [session_id, estimator],
          );
        } else {
          return res.status(400).json({
            message: "Either ids array or session_id/estimator required",
          });
        }

        res.json({ message: "Step 11 groups deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/estimator-step11-groups error", err);
        res.status(500).json({ message: "Failed to delete step 11 groups" });
      }
    },
  );

  app.delete(
    "/api/estimator-step12-qa-selection",
    authMiddleware,
    async (req: Request, res: Response) => {
      try {
        const { session_id, estimator } = req.body;

        await query(
          `
        DELETE FROM estimator_step12_qa_boq 
        WHERE bill_no = $1 AND estimator = $2
      `,
          [session_id, estimator],
        );

        res.json({ message: "Step 12 QA items deleted successfully" });
      } catch (err) {
        console.error("DELETE /api/estimator-step12-qa-selection error", err);
        res.status(500).json({ message: "Failed to delete step 12 QA items" });
      }
    },
  );

  // ====== STEP 11 PRODUCT CONFIGURATION ROUTES ======

  // POST /api/step11-products - Save product configuration
  app.post(
    "/api/step11-products",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (req: Request, res: Response) => {
      console.log("[POST /api/step11-products] body:", JSON.stringify(req.body).slice(0, 200) + "...");
      try {
        const {
          productId,
          productName,
          configName,
          categoryId,
          subcategoryId,
          totalCost,
          items,
        } = req.body;

        if (!productId) {
          console.warn("[POST /api/step11-products] Missing productId");
          res.status(400).json({ message: "Product ID is required" });
          return;
        }

        // Start transaction
        await query("BEGIN");

        try {
          // 1. Optional: Delete existing configuration if we specifically want to overwrite by config_name?
          // For now, let's just allow multiple. If config_name is provided, we could overwrite it.

          if (configName) {
            console.log(`[POST /api/step11-products] Checking for existing config named "${configName}" for productId: ${productId}`);
            await query("DELETE FROM step11_products WHERE product_id = $1 AND config_name = $2", [
              productId,
              configName,
            ]);
          }

          // ensure columns exist
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS required_unit_type VARCHAR(20)");
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS base_required_qty DECIMAL(10,4)");
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS wastage_pct_default DECIMAL(10,4)");
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS dim_a DECIMAL(10,4)");
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS dim_b DECIMAL(10,4)");
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS dim_c DECIMAL(10,4)");
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS description TEXT");

          // 2. Insert into step11_products
          console.log(`[POST /api/step11-products] Inserting new product config for productId: ${productId}`);
          const productResult = await query(
            `INSERT INTO step11_products (product_id, product_name, config_name, category_id, subcategory_id, total_cost, required_unit_type, base_required_qty, wastage_pct_default, dim_a, dim_b, dim_c, description, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
             RETURNING id`,
            [
              productId,
              productName,
              configName || 'Default Configuration',
              categoryId,
              subcategoryId,
              totalCost,
              req.body.requiredUnitType || 'Sqft',
              req.body.baseRequiredQty || 1,
              req.body.wastagePctDefault || 0,
              req.body.dimA || null,
              req.body.dimB || null,
              req.body.dimC || null,
              req.body.description || null
            ],
          );

          const step11ProductId = productResult.rows[0].id;
          console.log(`[POST /api/step11-products] Inserted step11_products with internal ID: ${step11ProductId}`);

          // 3. Insert items
          if (items && Array.isArray(items)) {
            console.log(`[POST /api/step11-products] Inserting ${items.length} items`);
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              console.log(`[POST /api/step11-products] Inserting item ${i + 1}/${items.length}:`, JSON.stringify(item));
              // ensure column exists
              await query("ALTER TABLE step11_product_items ADD COLUMN IF NOT EXISTS apply_wastage BOOLEAN DEFAULT TRUE");
              await query("ALTER TABLE step11_product_items ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255)");
              await query("ALTER TABLE step11_product_items ADD COLUMN IF NOT EXISTS base_qty DECIMAL(10,4)");

              await query(
                `INSERT INTO step11_product_items 
                 (step11_product_id, material_id, material_name, unit, qty, rate, supply_rate, install_rate, location, amount, apply_wastage, shop_name, base_qty)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                  step11ProductId,
                  item.materialId,
                  item.materialName,
                  item.unit,
                  item.qty,
                  item.rate,
                  item.supplyRate,
                  item.installRate,
                  item.location,
                  item.amount,
                  item.applyWastage !== undefined ? item.applyWastage : true,
                  item.shopName || item.shop_name || null,
                  item.baseQty ?? item.qty
                ],
              );
            }
          }

          console.log("[POST /api/step11-products] All items inserted. Committing...");
          await query("COMMIT");
          console.log("[POST /api/step11-products] Transaction committed. Sending 201 response.");
          res.status(201).json({ message: "Configuration saved successfully" });
        } catch (err) {
          console.error("[POST /api/step11-products] Internal error during transaction:", err);
          await query("ROLLBACK");
          throw err;
        }
      } catch (err) {
        console.error("POST /api/step11-products error:", err instanceof Error ? err.message : err);
        console.error("Full error:", err);
        res.status(500).json({ message: "Failed to save product configuration", error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // POST /api/product-step3-config - Save Step 3 (configuration step) data separately
  app.post(
    "/api/product-step3-config",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (req: Request, res: Response) => {
      try {
        const {
          productId,
          productName,
          configName,
          categoryId,
          subcategoryId,
          totalCost,
          items,
          requiredUnitType,
          baseRequiredQty,
          wastagePctDefault,
          dimA,
          dimB,
          dimC,
          description
        } = req.body;

        if (!productId) {
          res.status(400).json({ message: "Product ID is required" });
          return;
        }

        await query("BEGIN");
        try {
          // Delete existing Step 3 config for this product (overwrite)
          await query("DELETE FROM product_step3_config WHERE product_id = $1", [productId]);

          // ensure columns exist
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS dim_a DECIMAL(10,4)");
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS dim_b DECIMAL(10,4)");
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS dim_c DECIMAL(10,4)");
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS description TEXT");

          // Insert new Step 3 config header
          const configResult = await query(
            `INSERT INTO product_step3_config (
              product_id, product_name, config_name, category_id, subcategory_id, 
              total_cost, required_unit_type, base_required_qty, wastage_pct_default,
              dim_a, dim_b, dim_c, description,
              created_at, updated_at
            )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING id`,
            [
              productId,
              productName,
              configName || "Default",
              categoryId,
              subcategoryId,
              totalCost,
              requiredUnitType || 'Sqft',
              baseRequiredQty || 1,
              wastagePctDefault || 0,
              dimA || null,
              dimB || null,
              dimC || null,
              description || null
            ],
          );

          const step3ConfigId = configResult.rows[0].id;

          // insert items
          if (items && Array.isArray(items)) {
            // ensure column exists
            await query("ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS apply_wastage BOOLEAN DEFAULT TRUE");

            // Add shop_name to config items
            await query("ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255)");

            for (const item of items) {
              await query(
                `INSERT INTO product_step3_config_items
                 (step3_config_id, material_id, material_name, unit, qty, rate, supply_rate, install_rate, location, amount, base_qty, wastage_pct, apply_wastage, shop_name)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                [
                  step3ConfigId,
                  item.materialId,
                  item.materialName,
                  item.unit,
                  item.qty,
                  item.rate,
                  item.supplyRate,
                  item.installRate,
                  item.location,
                  item.amount,
                  item.baseQty,
                  item.wastagePct,
                  item.applyWastage !== undefined ? item.applyWastage : true,
                  item.shopName || item.shop_name || null
                ],
              );
            }
          }

          await query("COMMIT");
          res.status(201).json({ message: "Step 3 configuration saved successfully", id: step3ConfigId });
        } catch (err) {
          await query("ROLLBACK");
          throw err;
        }
      } catch (err) {
        console.error("POST /api/product-step3-config error:", err instanceof Error ? err.message : err);
        res.status(500).json({ message: "Failed to save Step 3 configuration", error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  // GET /api/product-step3-config/:productId - Load Step 3 config for a product
  app.get(
    "/api/product-step3-config/:productId",
    authMiddleware,
    async (req: Request, res: Response) => {
      const { productId } = req.params;
      try {
        const configResult = await query(
          "SELECT * FROM product_step3_config WHERE product_id = $1 ORDER BY updated_at DESC LIMIT 1",
          [productId],
        );
        if (configResult.rows.length === 0) {
          res.status(404).json({ message: "No Step 3 configuration found" });
          return;
        }
        const config = configResult.rows[0];
        const itemsResult = await query(
          "SELECT * FROM product_step3_config_items WHERE step3_config_id = $1 ORDER BY id ASC",
          [config.id],
        );
        res.json({ config, items: itemsResult.rows });
      } catch (err) {
        console.error("GET /api/product-step3-config/:productId error:", err);
        res.status(500).json({ message: "Failed to load Step 3 configuration" });
      }
    },
  );

  // GET /api/step11-products/:productId - Load ALL configurations for this product
  app.get(
    "/api/step11-products/:productId",
    async (req: Request, res: Response) => {
      const { productId } = req.params;
      const logMsg = `[${new Date().toISOString()}] GET /api/step11-products/${productId}\n`;
      fs.appendFileSync('server_api_log.txt', logMsg);

      try {
        // 0. Fetch the product name for this productId to ensure we catch all configurations
        // (Legacy data might use different UUIDs for the same product name)
        const productInfo = await query("SELECT name FROM products WHERE id = $1", [productId]);
        const productName = productInfo.rows[0]?.name;

        // 1. Fetch approved configurations (Step 11)
        // Query by BOTH productId and productName to ensure consistency
        const step11Result = await query(
          `SELECT *, 'approved' as status FROM step11_products 
           WHERE product_id = $1 ${productName ? "OR product_name = $2" : ""} 
           ORDER BY updated_at DESC`,
          productName ? [productId, productName] : [productId],
        );

        // 2. Fetch draft configurations (Step 3)
        const step3Result = await query(
          `SELECT *, 'draft' as status FROM product_step3_config 
           WHERE product_id = $1 ${productName ? "OR product_name = $2" : ""} 
           ORDER BY updated_at DESC`,
          productName ? [productId, productName] : [productId],
        );

        const resLog = `  -> Found ${step11Result.rows.length} approved and ${step3Result.rows.length} draft configurations\n`;
        fs.appendFileSync('server_api_log.txt', resLog);

        // Fetch latest Step 3 config for this product to use as smart fallback for legacy records
        const step3LatestResult = await query(
          `SELECT required_unit_type, base_required_qty, wastage_pct_default, description FROM product_step3_config 
           WHERE product_id = $1 ${productName ? "OR product_name = $2" : ""} 
           ORDER BY updated_at DESC LIMIT 1`,
          productName ? [productId, productName] : [productId]
        );
        const step3Fallback = step3LatestResult.rows[0] || { required_unit_type: 'Sqft', base_required_qty: 100, wastage_pct_default: 0, description: null };

        // 3. Process Step 11 configurations
        const enhancedStep11 = await Promise.all(step11Result.rows.map(async (p: any) => {
          p.required_unit_type = p.required_unit_type || step3Fallback.required_unit_type || 'Sqft';
          p.base_required_qty = p.base_required_qty || step3Fallback.base_required_qty || 100;
          p.wastage_pct_default = p.wastage_pct_default || step3Fallback.wastage_pct_default || 0;
          p.description = p.description || step3Fallback.description;

          const itemsResult = await query(
            "SELECT * FROM step11_product_items WHERE step11_product_id = $1",
            [p.id],
          );
          return {
            product: p,
            items: itemsResult.rows,
          };
        }));

        // 4. Process Step 3 configurations
        const enhancedStep3 = await Promise.all(step3Result.rows.map(async (p: any) => {
          const itemsResult = await query(
            "SELECT * FROM product_step3_config_items WHERE step3_config_id = $1",
            [p.id],
          );
          return {
            product: p,
            items: itemsResult.rows,
          };
        }));

        // 5. Merge, Sort, and Deduplicate by config_name
        const mergedConfigs = [...enhancedStep11, ...enhancedStep3].sort((a, b) =>
          new Date(b.product.updated_at).getTime() - new Date(a.product.updated_at).getTime()
        );

        const seenNames = new Set<string>();
        const allConfigs = mergedConfigs.filter(cfg => {
          const configName = (cfg.product.config_name || "").toLowerCase().trim();
          if (seenNames.has(configName)) {
            return false;
          }
          seenNames.add(configName);
          return true;
        });

        res.json({
          configurations: allConfigs,
        });
      } catch (err) {
        console.error("GET /api/step11-products/:productId error", err);
        res.status(500).json({ message: "Failed to load product configurations" });
      }
    },
  );

  // GET /api/step11-products/config/:id - Load specific configuration with items
  app.get(
    "/api/step11-products/config/:id",
    async (req: Request, res: Response) => {
      const { id } = req.params;
      console.log("[GET /api/step11-products/config/:id] id:", id);
      try {
        const productResult = await query(
          "SELECT * FROM step11_products WHERE id = $1",
          [id],
        );

        if (productResult.rows.length === 0) {
          res.status(404).json({ message: "Configuration not found" });
          return;
        }

        const product = productResult.rows[0];
        // Fetch Step 3 fallback for legacy records
        const step3Result = await query(
          "SELECT required_unit_type, base_required_qty, wastage_pct_default, description FROM product_step3_config WHERE product_id = $1 ORDER BY updated_at DESC LIMIT 1",
          [product.product_id]
        );
        const step3Fallback = step3Result.rows[0] || { required_unit_type: 'Sqft', base_required_qty: 100, wastage_pct_default: 0, description: null };

        // Apply fallbacks for legacy records
        product.required_unit_type = product.required_unit_type || step3Fallback.required_unit_type || 'Sqft';
        product.base_required_qty = product.base_required_qty || step3Fallback.base_required_qty || 100;
        product.wastage_pct_default = product.wastage_pct_default || step3Fallback.wastage_pct_default || 0;
        product.description = product.description || step3Fallback.description;

        const itemsResult = await query(
          "SELECT * FROM step11_product_items WHERE step11_product_id = $1",
          [id],
        );

        res.json({
          product,
          items: itemsResult.rows,
        });
      } catch (err) {
        console.error("GET /api/step11-products/config/:id error", err);
        res.status(500).json({ message: "Failed to load specific configuration" });
      }
    },
  );

  // DELETE /api/step11-products/config/:id - Delete a configuration
  app.delete(
    "/api/step11-products/config/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      try {
        await query("BEGIN");
        let result;
        if (isUuid) {
          // Permanent Step 11 configuration
          result = await query("DELETE FROM step11_products WHERE id = $1", [id]);
        } else {
          // Step 3 Draft configuration (ID is integer)
          result = await query("DELETE FROM product_step3_config WHERE id = $1", [id]);
        }
        await query("COMMIT");

        if (result.rowCount === 0) {
          res.status(404).json({ message: "Configuration not found" });
          return;
        }
        res.json({ message: "Configuration deleted successfully" });
      } catch (err) {
        await query("ROLLBACK");
        console.error("DELETE /api/step11-products/config/:id error", err);
        res.status(500).json({ message: "Failed to delete configuration" });
      }
    }
  );

  // ====== GLOBAL SETTINGS ROUTES ======

  app.get("/api/global-settings", authMiddleware, async (_req, res) => {
    try {
      const result = await query(`SELECT * FROM global_settings`);
      const settings: { [key: string]: any } = {};
      result.rows.forEach(row => {
        settings[row.id] = row.value;
      });
      res.json(settings);
    } catch (err) {
      console.error("Failed to fetch global settings:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/global-settings/:id", authMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { value } = req.body;
      await query(
        `INSERT INTO global_settings (id, value, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [id, JSON.stringify(value)]
      );
      res.json({ message: `Setting ${id} updated` });
    } catch (err) {
      console.error(`Failed to update global setting ${req.params.id}:`, err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ==================== PRODUCT APPROVAL ROUTES ====================
  // Ensure product_approvals has rejection_reason column
  query("ALTER TABLE product_approvals ADD COLUMN IF NOT EXISTS rejection_reason TEXT").catch(() => { });

  // POST /api/product-approvals - Submit for approval
  app.post(
    "/api/product-approvals",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (req: Request, res: Response) => {
      try {
        const {
          productId, productName, configName, categoryId, subcategoryId,
          totalCost, items, requiredUnitType, baseRequiredQty, wastagePctDefault,
          dimA, dimB, dimC, description
        } = req.body;

        if (!productId) {
          res.status(400).json({ message: "Product ID is required" });
          return;
        }

        await query("BEGIN");
        try {
          const approvalResult = await query(
            `INSERT INTO product_approvals (
              product_id, product_name, config_name, category_id, subcategory_id,
              total_cost, required_unit_type, base_required_qty, wastage_pct_default,
              dim_a, dim_b, dim_c, description, status, created_by,
              created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,NOW(),NOW()) RETURNING id`,
            [
              productId, productName, configName || "Default", categoryId, subcategoryId,
              totalCost, requiredUnitType || 'Sqft', baseRequiredQty || 1, wastagePctDefault || 0,
              dimA || null, dimB || null, dimC || null, description || null,
              (req.user as any)?.username || 'unknown'
            ]
          );
          const approvalId = approvalResult.rows[0].id;

          if (items && Array.isArray(items)) {
            for (const item of items) {
              await query(
                `INSERT INTO product_approval_items
                 (approval_id, material_id, material_name, unit, qty, rate, supply_rate, install_rate, location, amount, base_qty, wastage_pct, apply_wastage, shop_name)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                [
                  approvalId, item.materialId, item.materialName, item.unit, item.qty, item.rate,
                  item.supplyRate, item.installRate, item.location, item.amount,
                  item.baseQty, item.wastagePct,
                  item.applyWastage !== undefined ? item.applyWastage : true,
                  item.shopName || item.shop_name || null
                ]
              );
            }
          }

          await query("COMMIT");
          res.status(201).json({ message: "Product configuration submitted for approval", id: approvalId });
        } catch (err) {
          await query("ROLLBACK");
          throw err;
        }
      } catch (err) {
        console.error("POST /api/product-approvals error:", err);
        res.status(500).json({ message: "Failed to submit for approval" });
      }
    }
  );

  // GET /api/product-approvals - List all approval requests
  app.get(
    "/api/product-approvals",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (_req: Request, res: Response) => {
      try {
        const result = await query(
          "SELECT * FROM product_approvals ORDER BY created_at DESC"
        );
        res.json({ approvals: result.rows });
      } catch (err) {
        console.error("GET /api/product-approvals error:", err);
        res.status(500).json({ message: "Failed to load approval requests" });
      }
    }
  );

  // GET /api/product-approvals/:id - Get details for a specific approval
  app.get(
    "/api/product-approvals/:id",
    authMiddleware,
    requireRole("admin", "software_team", "purchase_team", "product_manager", "pre_sales"),
    async (req: Request, res: Response) => {
      try {
        const approvalResult = await query("SELECT * FROM product_approvals WHERE id = $1", [req.params.id]);
        if (approvalResult.rows.length === 0) {
          res.status(404).json({ message: "Approval request not found" });
          return;
        }
        const itemsResult = await query(
          "SELECT * FROM product_approval_items WHERE approval_id = $1 ORDER BY id ASC",
          [req.params.id]
        );
        res.json({ approval: approvalResult.rows[0], items: itemsResult.rows });
      } catch (err) {
        console.error("GET /api/product-approvals/:id error:", err);
        res.status(500).json({ message: "Failed to load approval details" });
      }
    }
  );

  // POST /api/product-approvals/:id/approve - Approve a request
  app.post(
    "/api/product-approvals/:id/approve",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      try {
        await query("BEGIN");
        try {
          const approvalResult = await query(
            "SELECT * FROM product_approvals WHERE id = $1 AND status = 'pending'", [id]
          );
          if (approvalResult.rows.length === 0) {
            await query("ROLLBACK");
            res.status(404).json({ message: "Pending approval request not found" });
            return;
          }
          const appVal = approvalResult.rows[0];
          const itemsResult = await query(
            "SELECT * FROM product_approval_items WHERE approval_id = $1", [id]
          );
          const appItems = itemsResult.rows;

          // 1. Save to product_step3_config (overwrite)
          await query("DELETE FROM product_step3_config WHERE product_id = $1", [appVal.product_id]);
          // Ensure columns exist (best-effort)
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS dim_a DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS dim_b DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS dim_c DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE product_step3_config ADD COLUMN IF NOT EXISTS description TEXT").catch(() => { });

          const step3ConfigResult = await query(
            `INSERT INTO product_step3_config (
              product_id, product_name, config_name, category_id, subcategory_id,
              total_cost, required_unit_type, base_required_qty, wastage_pct_default,
              dim_a, dim_b, dim_c, description, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING id`,
            [
              appVal.product_id, appVal.product_name, appVal.config_name,
              appVal.category_id, appVal.subcategory_id, appVal.total_cost,
              appVal.required_unit_type, appVal.base_required_qty, appVal.wastage_pct_default,
              appVal.dim_a, appVal.dim_b, appVal.dim_c, appVal.description
            ]
          );
          const step3Id = step3ConfigResult.rows[0].id;

          // Ensure item columns exist
          await query("ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS apply_wastage BOOLEAN DEFAULT TRUE").catch(() => { });
          await query("ALTER TABLE product_step3_config_items ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255)").catch(() => { });

          for (const item of appItems) {
            await query(
              `INSERT INTO product_step3_config_items
               (step3_config_id, material_id, material_name, unit, qty, rate, supply_rate, install_rate, location, amount, base_qty, wastage_pct, apply_wastage, shop_name)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
              [
                step3Id, item.material_id, item.material_name, item.unit,
                item.qty, item.rate, item.supply_rate, item.install_rate,
                item.location, item.amount, item.base_qty, item.wastage_pct,
                item.apply_wastage, item.shop_name
              ]
            );
          }

          // 2. Save to step11_products (include all columns matching the original POST route)
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS required_unit_type VARCHAR(20)").catch(() => { });
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS base_required_qty DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS wastage_pct_default DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS dim_a DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS dim_b DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS dim_c DECIMAL(10,4)").catch(() => { });
          await query("ALTER TABLE step11_products ADD COLUMN IF NOT EXISTS description TEXT").catch(() => { });

          // Delete existing config with same config_name if any
          if (appVal.config_name) {
            await query("DELETE FROM step11_products WHERE product_id = $1 AND config_name = $2", [appVal.product_id, appVal.config_name]);
          }

          const step11Result = await query(
            `INSERT INTO step11_products (product_id, product_name, config_name, category_id, subcategory_id, total_cost, required_unit_type, base_required_qty, wastage_pct_default, dim_a, dim_b, dim_c, description, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW()) RETURNING id`,
            [
              appVal.product_id, appVal.product_name, appVal.config_name || 'Default Configuration',
              appVal.category_id, appVal.subcategory_id, appVal.total_cost,
              appVal.required_unit_type || 'Sqft', appVal.base_required_qty || 1, appVal.wastage_pct_default || 0,
              appVal.dim_a, appVal.dim_b, appVal.dim_c, appVal.description
            ]
          );
          const step11Id = step11Result.rows[0].id;

          await query("ALTER TABLE step11_product_items ADD COLUMN IF NOT EXISTS apply_wastage BOOLEAN DEFAULT TRUE").catch(() => { });
          await query("ALTER TABLE step11_product_items ADD COLUMN IF NOT EXISTS shop_name VARCHAR(255)").catch(() => { });

          for (const item of appItems) {
            await query(
              `INSERT INTO step11_product_items (step11_product_id, material_id, material_name, unit, qty, rate, supply_rate, install_rate, location, amount, apply_wastage, shop_name)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [
                step11Id, item.material_id, item.material_name, item.unit,
                item.qty, item.rate, item.supply_rate, item.install_rate,
                item.location, item.amount, item.apply_wastage, item.shop_name
              ]
            );
          }

          // 3. Mark approved
          await query("UPDATE product_approvals SET status = 'approved', updated_at = NOW() WHERE id = $1", [id]);

          await query("COMMIT");
          res.json({ message: "Product configuration approved and saved successfully" });
        } catch (err) {
          await query("ROLLBACK");
          throw err;
        }
      } catch (err) {
        console.error("POST /api/product-approvals/:id/approve error:", err);
        res.status(500).json({ message: "Failed to approve request" });
      }
    }
  );

  // POST /api/product-approvals/:id/reject - Reject a request
  app.post(
    "/api/product-approvals/:id/reject",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      try {
        const { rejection_reason } = req.body;
        const result = await query(
          "UPDATE product_approvals SET status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING id",
          [rejection_reason || null, req.params.id]
        );
        if (result.rows.length === 0) {
          res.status(404).json({ message: "Pending approval not found" });
          return;
        }
        res.json({ message: "Product configuration rejected", rejection_reason });
      } catch (err) {
        console.error("POST /api/product-approvals/:id/reject error:", err);
        res.status(500).json({ message: "Failed to reject request" });
      }
    }
  );

  // DELETE /api/product-approvals/:id - Delete an approval request and its items
  app.delete(
    "/api/product-approvals/:id",
    authMiddleware,
    requireRole("admin", "software_team"),
    async (req: Request, res: Response) => {
      const { id } = req.params;
      try {
        await query("BEGIN");
        try {
          // remove child items first
          await query("DELETE FROM product_approval_items WHERE approval_id = $1", [id]);
          const result = await query("DELETE FROM product_approvals WHERE id = $1 RETURNING id", [id]);
          if (result.rows.length === 0) {
            await query("ROLLBACK");
            res.status(404).json({ message: "Approval request not found" });
            return;
          }
          await query("COMMIT");
          res.json({ message: "Approval request deleted" });
        } catch (err) {
          await query("ROLLBACK");
          throw err;
        }
      } catch (err) {
        console.error("DELETE /api/product-approvals/:id error:", err);
        res.status(500).json({ message: "Failed to delete approval request" });
      }
    }
  );

  return httpServer;
}
