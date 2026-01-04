const fs = require('fs');
const path = require('path');

const targetDir = 'D:\\PORTFOLIO\\webpage\\assets\\Residential';

console.log(`Inspecting directories in: ${targetDir}`);

try {
    const files = fs.readdirSync(targetDir);
    files.forEach(file => {
        if (file.includes('1953')) {
            console.log(`\nFolder: "${file}"`);
            const codes = [];
            for (let i = 0; i < file.length; i++) {
                codes.push(file.charCodeAt(i));
            }
            console.log(`Char codes: ${codes.join(', ')}`);
        }
    });
} catch (err) {
    console.error(`Error reading directory: ${err.message}`);
}
