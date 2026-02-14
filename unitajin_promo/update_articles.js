const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const MAGAZINE_URL = 'https://note.com/taskchute/m/m80cde2fde6bf';
const DATA_FILE_PATH = path.join(__dirname, 'data.js');

(async () => {
    console.log('🚀 Launching browser...');
    // Create a new browser instance
    const browser = await puppeteer.launch({
        headless: "new"
    });
    const page = await browser.newPage();

    console.log(`🌍 Navigating to ${MAGAZINE_URL}...`);
    await page.goto(MAGAZINE_URL, { waitUntil: 'networkidle2' });

    // Scroll to load more articles (simple scroll)
    await autoScroll(page);

    console.log('📄 Extracting articles...');
    const newArticles = await page.evaluate(() => {
        const articles = [];
        const seenUrls = new Set();

        // Helper to add article if unique
        const add = (data) => {
            if (data.url && !seenUrls.has(data.url)) {
                seenUrls.add(data.url);
                articles.push(data);
            }
        };

        // Strategy 1: Find card components
        // Note: New layout uses .m-largeNoteWrapper__card
        const cards = Array.from(document.querySelectorAll('.m-largeNoteWrapper__card, .o-magazineArrangeNotesItem, .o-magazineSummary, .m-magazine-article-card'));

        cards.forEach(card => {
            try {
                // Title search
                const titleEl = card.querySelector('.m-noteBodyTitle__title') ||
                    card.querySelector('.m-magazineInfoHeadline__titleLabel') ||
                    card.querySelector('.o-magazineSummary__headline') ||
                    card.querySelector('h3');

                // Link search
                let url = '';
                const linkEl = card.querySelector('a.m-largeNoteWrapper__link') ||
                    card.querySelector('a[href*="/n/"]');
                if (linkEl) url = linkEl.href;

                // Image search
                const imgEl = card.querySelector('.m-thumbnail__image') ||
                    card.querySelector('.o-magazineSummary__image') ||
                    card.querySelector('img');

                // Author search
                const authorEl = card.querySelector('.m-noteUser__name') ||
                    card.querySelector('.o-magazineSummary__creatorTitle') ||
                    card.querySelector('.m-magazineCreator') ||
                    card.querySelector('.o-noteCheck-user');

                // Date search
                const dateEl = card.querySelector('time') ||
                    card.querySelector('.m-note-body__date') ||
                    card.querySelector('.o-noteCheck-date');

                if (url && titleEl) {
                    // Fix URL if relative
                    const fullUrl = url.startsWith('http') ? url : `https://note.com${url}`;

                    let image = imgEl ? (imgEl.getAttribute('data-src') || imgEl.src) : '';
                    if (image) image = image.split('?')[0] + '?width=1280';

                    let dateStr = new Date().toLocaleDateString();
                    if (dateEl) {
                        const dt = dateEl.getAttribute('datetime');
                        if (dt) {
                            const d = new Date(dt);
                            const year = d.getFullYear();
                            const month = d.getMonth() + 1;
                            const day = d.getDate();
                            const hour = d.getHours().toString().padStart(2, '0');
                            const min = d.getMinutes().toString().padStart(2, '0');
                            dateStr = `${year}年${month}月${day}日 ${hour}:${min}`;
                        } else {
                            dateStr = dateEl.innerText.trim();
                        }
                    }

                    add({
                        title: titleEl.innerText.trim(),
                        url: fullUrl,
                        image: image,
                        author: authorEl ? authorEl.innerText.trim() : 'Unitajin',
                        date: dateStr,
                        tags: []
                    });
                }
            } catch (e) { }
        });

        // Strategy 2: Fallback to broad anchor search if few results
        if (articles.length < 5) {
            // ... (Keep existing fallback but maybe update if needed, though robust enough for now)
            // The previous fallback was generic anchors. Let's keep it.
            const anchors = Array.from(document.querySelectorAll('a'));
            anchors.forEach(a => {
                const href = a.getAttribute('href');
                if (href && /\/n\/n[a-z0-9]+/.test(href)) {
                    const fullUrl = href.startsWith('http') ? href : `https://note.com${href}`;
                    if (seenUrls.has(fullUrl)) return;

                    const wrapper = a.closest('div');
                    let title = a.innerText.trim();
                    if (!title || title.length < 2) {
                        const h3 = wrapper ? wrapper.querySelector('h3') : null;
                        if (h3) title = h3.innerText.trim();
                    }

                    const img = wrapper ? wrapper.querySelector('img') : null;
                    let image = img ? img.src : '';
                    if (image) image = image.split('?')[0] + '?width=1280';

                    add({
                        title: title || 'No Title',
                        url: fullUrl,
                        image: image,
                        author: 'Unitajin',
                        date: new Date().toLocaleDateString(),
                        tags: []
                    });
                }
            });
        }

        return articles;
    });

    console.log(`✅ Found ${newArticles.length} articles.`);

    await browser.close();

    // Update data.js
    updateDataJs(newArticles);

})();

function updateDataJs(newArticles) {
    let fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');

    const existingUrls = new Set();
    const urlRegex = /"url":\s*"([^"]+)"/g;
    let match;
    while ((match = urlRegex.exec(fileContent)) !== null) {
        existingUrls.add(match[1]);
    }

    const articlesToAdd = newArticles.filter(a => !existingUrls.has(a.url));

    if (articlesToAdd.length === 0) {
        console.log('🎉 No new articles to add.');
        return;
    }

    console.log(`✨ Adding ${articlesToAdd.length} new articles...`);

    // Format new articles as JS object strings
    const newArticlesStr = articlesToAdd.map(a => JSON.stringify(a, null, 4)).join(',\n    ') + ',\n    ';

    // Insert after `const articles = [`
    const insertPos = fileContent.indexOf('[') + 1;
    const newFileContent = fileContent.slice(0, insertPos) + '\n    ' + newArticlesStr + fileContent.slice(insertPos);

    fs.writeFileSync(DATA_FILE_PATH, newFileContent);
    console.log('💾 data.js updated successfully!');
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            var totalHeight = 0;
            var distance = 100;
            var timer = setInterval(() => {
                var scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                // Scroll for a bit to get dynamic content
                if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 5000) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}
