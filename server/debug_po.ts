import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), ".env") });

import { query } from "./db/client";

async function debug() {
  const poId = 'ccd19a45-c071-4ec8-8d5e-05686b6f079e';
  
  console.log("--- PO Items ---");
  const poItems = await query(`SELECT id, material_id, item, qty FROM purchase_order_items WHERE po_id = $1`, [poId]);
  console.log(JSON.stringify(poItems.rows, null, 2));

  console.log("\n--- PO Status ---");
  const po = await query(`SELECT po_number, status FROM purchase_orders WHERE id = $1`, [poId]);
  console.log(JSON.stringify(po.rows, null, 2));

  if (poItems.rows.length > 0) {
    const materialId = poItems.rows[0].material_id;
    console.log(`\n--- Product Config Items for material_id: ${materialId} ---`);
    const configItems = await query(`SELECT * FROM product_step3_config_items WHERE material_id = $1`, [materialId]);
    console.log(JSON.stringify(configItems.rows, null, 2));
  }

  process.exit(0);
}

debug().catch(err => {
  console.error(err);
  process.exit(1);
});
