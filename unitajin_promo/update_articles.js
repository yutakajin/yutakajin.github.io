const fs = require('fs');
const path = require('path');
const https = require('https');

const RSS_URL = 'https://note.com/taskchute/m/m80cde2fde6bf/rss';
const DATA_FILE_PATH = path.join(__dirname, 'data.js');

function fetchRSS(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

function extractArticles(xml) {
    const articles = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
        const itemObj = match[1];
        
        const titleMatch = itemObj.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/);
        const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : '';
        
        const linkMatch = itemObj.match(/<link>([\s\S]*?)<\/link>/);
        let link = linkMatch ? linkMatch[1].trim() : '';
        
        const imageMatch = itemObj.match(/<media:thumbnail>([\s\S]*?)<\/media:thumbnail>/);
        let image = imageMatch ? imageMatch[1].trim() : '';
        if (image) image = image.replace(/\?width=\d+/, '?width=1280');
        
        const authorMatch = itemObj.match(/<note:creatorName>([\s\S]*?)<\/note:creatorName>/);
        const author = authorMatch ? authorMatch[1].trim() : 'Unitajin';
        
        const pubDateMatch = itemObj.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        let dateStr = new Date().toLocaleDateString();
        if (pubDateMatch) {
            const d = new Date(pubDateMatch[1].trim());
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const hour = d.getHours().toString().padStart(2, '0');
            const min = d.getMinutes().toString().padStart(2, '0');
            dateStr = `${year}年${month}月${day}日 ${hour}:${min}`;
        }
        
        if (title && link) {
            articles.push({
                title: title,
                url: link + '?magazine_key=m80cde2fde6bf',
                image: image,
                author: author,
                date: dateStr,
                tags: []
            });
        }
    }
    
    return articles;
}

(async () => {
    console.log(`🌍 Fetching RSS from ${RSS_URL}...`);
    try {
        const xml = await fetchRSS(RSS_URL);
        console.log('📄 Extracting articles...');
        const newArticles = extractArticles(xml);
        
        console.log(`✅ Found ${newArticles.length} articles.`);
        
        updateDataJs(newArticles);
    } catch (e) {
        console.error('❌ Error fetching RSS:', e);
    }
})();

function updateDataJs(newArticles) {
    let fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');

    const existingUrls = new Set();
    const urlRegex = /"url":\s*"([^"]+)"/g;
    let match;
    while ((match = urlRegex.exec(fileContent)) !== null) {
        let u = match[1];
        if (u.includes('?')) u = u.split('?')[0];
        existingUrls.add(u);
    }

    const articlesToAdd = newArticles.filter(a => {
        let u = a.url;
        if (u.includes('?')) u = u.split('?')[0];
        return !existingUrls.has(u);
    });

    if (articlesToAdd.length === 0) {
        console.log('🎉 No new articles to add.');
        return;
    }

    console.log(`✨ Adding ${articlesToAdd.length} new articles: ` + articlesToAdd.map(a => a.title).join(', '));

    // Format new articles as JS object strings
    const newArticlesStr = articlesToAdd.map(a => JSON.stringify(a, null, 4)).join(',\n    ') + ',\n    ';

    // Insert after `const articles = [`
    const insertPos = fileContent.indexOf('[') + 1;
    const newFileContent = fileContent.slice(0, insertPos) + '\n    ' + newArticlesStr + fileContent.slice(insertPos);

    fs.writeFileSync(DATA_FILE_PATH, newFileContent);
    console.log('💾 data.js updated successfully!');
}
