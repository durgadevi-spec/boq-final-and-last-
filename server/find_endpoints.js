const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split(/\r?\n/);
const targets = ['/materials', '/products', '/categories', '/subcategories', '/material-templates', '/bom-versions', '/boq-versions', '/bom-templates', '/boq-templates'];
const out = [];

lines.forEach((line, i) => {
    if (line.includes('app.get(') || line.includes('app.delete(') || line.includes('app.get (') || line.includes('app.delete (')) {
        targets.forEach(t => {
            if (line.includes('"/api' + t + '"') || line.includes("'/api" + t + "'") || line.includes('"/api' + t + '/:id"') || line.includes("'/api" + t + "/:id'")) {
                out.push(`${i + 1}: ${line.trim()}`);
            }
        });
    }
});
fs.writeFileSync('server/found_endpoints.txt', out.join('\n'));
