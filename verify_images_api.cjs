const { query } = require('./server/db/client');

async function verifyApi() {
  console.log("Checking Material Search API response columns...");
  
  try {
    // Check materials
    const materials = await query(`SELECT id::text, name, COALESCE(code,'') as code, rate, unit, category, image, 'Material' as type FROM materials LIMIT 1`);
    console.log("Materials columns:", Object.keys(materials.rows[0] || {}));
    
    // Check material_templates
    const templates = await query(`SELECT id::text, name, COALESCE(code,'') as code, null as rate, null as unit, COALESCE(category,'') as category, image, 'Template' as type FROM material_templates LIMIT 1`);
    console.log("Templates columns:", Object.keys(templates.rows[0] || {}));
    
    // Check products
    const products = await query(`SELECT id::text, name, null as code, null as rate, null as unit, COALESCE(subcategory,'') as category, image, 'Product' as type FROM products LIMIT 1`);
    console.log("Products columns:", Object.keys(products.rows[0] || {}));
    
    console.log("\nVerification SUCCESS: All queries returned the 'image' column.");
  } catch (err) {
    console.error("\nVerification FAILED:", err.message);
    process.exit(1);
  }
}

verifyApi();
