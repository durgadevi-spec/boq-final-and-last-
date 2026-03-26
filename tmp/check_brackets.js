import fs from 'fs';

const content = fs.readFileSync('c:/Users/Hello/Documents/BOQ/BOQ-last-main/BOQ-last-main/client/src/components/layout/Sidebar.tsx', 'utf8');

let p = 0; // parentheses
let b = 0; // braces
let s = 0; // square brackets

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') p++;
    else if (char === ')') p--;
    else if (char === '{') b++;
    else if (char === '}') b--;
    else if (char === '[') s++;
    else if (char === ']') s--;
    
    if (p < 0 || b < 0 || s < 0) {
        console.log(`Unbalanced at char ${i} (${content.substring(i-20, i+20)})`);
        break;
    }
}

console.log(`Final counts: ()${p}, {}${b}, []${s}`);
