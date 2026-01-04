const fs = require('fs');
const path = require('path');

const targetDir = 'D:\\PORTFOLIO\\webpage\\assets\\Residential\\1953 - Singapore - 2022 - F';

console.log(`Inspecting directory: ${targetDir}`);

try {
    const files = fs.readdirSync(targetDir);
    files.forEach(file => {
        console.log(`\nFile: "${file}"`);
        const codes = [];
        for (let i = 0; i < file.length; i++) {
            codes.push(file.charCodeAt(i));
        }
        console.log(`Char codes: ${codes.join(', ')}`);
    });
} catch (err) {
    console.error(`Error reading directory: ${err.message}`);
}
