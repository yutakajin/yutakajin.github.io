const fs = require('fs');
const path = require('path');

const bulkDataPath = 'all_articles_bulk.json';
const dataJsPath = 'promo/data.js';

if (!fs.existsSync(bulkDataPath)) {
    console.error('Bulk data not found');
    process.exit(1);
}

const bulkData = JSON.parse(fs.readFileSync(bulkDataPath, 'utf8'));
const oldDataJs = fs.readFileSync(dataJsPath, 'utf8');

const authorStart = oldDataJs.indexOf('const authors =');
if (authorStart === -1) {
    console.error('Could not find authors block');
    process.exit(1);
}

const tailBytes = oldDataJs.substring(authorStart);

const newArticles = bulkData.map(a => ({
    title: a.title,
    author: a.author || 'Unitajin',
    date: a.date,
    url: a.url,
    tags: ['タスクシュート'], // Default tag matching existing filter
    image: a.image || '' // Ensure image is set (even if empty string)
}));

// Sort by date descending
newArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

const newContent = `const articles = ${JSON.stringify(newArticles, null, 4)};\n\n${tailBytes}`;

fs.writeFileSync(dataJsPath, newContent);
console.log(`Updated data.js with ${newArticles.length} articles.`);
