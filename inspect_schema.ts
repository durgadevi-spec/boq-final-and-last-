import { query } from './server/db/client';

async function inspectSchema() {
    try {
        const materialsCols = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'materials' AND table_schema = 'public'
    `);
        console.log('--- materials columns ---');
        materialsCols.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

        const submissionsCols = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'material_submissions' AND table_schema = 'public'
    `);
        console.log('\n--- material_submissions columns ---');
        submissionsCols.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

    } catch (err) {
        console.error('Error:', err);
    }
    process.exit(0);
}

inspectSchema();
