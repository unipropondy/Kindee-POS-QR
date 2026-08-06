const fs = require('fs');
const filePath = 'backend/routes/sales.js';
let content = fs.readFileSync(filePath, 'utf8');
// Replace escaped backticks (\`) with actual backticks
content = content.replace(/\\`/g, '`');
// Replace escaped ${ (\${) with ${
content = content.replace(/\\\${/g, '${');
fs.writeFileSync(filePath, content);
console.log('Fixed sales.js');
