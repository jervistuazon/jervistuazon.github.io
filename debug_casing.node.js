const fs = require('fs');
const path = require('path');

const root = 'D:\\PORTFOLIO\\webpage';
console.log(`Listing ${root}:`);
fs.readdirSync(root).forEach(f => {
    if (f.toLowerCase() === 'assets') console.log(`Found: "${f}"`);
});

const assets = 'D:\\PORTFOLIO\\webpage\\assets';
console.log(`\nListing ${assets}:`);
fs.readdirSync(assets).forEach(f => {
    if (f.toLowerCase() === 'residential') console.log(`Found: "${f}"`);
});
