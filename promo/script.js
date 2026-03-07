document.addEventListener('DOMContentLoaded', () => {
    // Collect all unique authors from articles
    const authorsList = [...new Set(articles.map(a => a.author))];

    renderRecommendation();
    renderSidebar(null, authorsList); // Pass null for tags

    // Limit to Recent (e.g., top 24)
    const recentArticles = articles.slice(0, 24);
    renderArticles(recentArticles);
});

// --- Today's Recommendation Banner ---
function renderRecommendation() {
    const container = document.getElementById('recommendation-banner');

    // Pick random article
    const randomIndex = Math.floor(Math.random() * articles.length);
    const article = articles[randomIndex];

    // Note: The header "今のあなたにオススメ" is now in index.html structure
    container.innerHTML = `
        <img src="${article.image || 'hero_bg.png'}" alt="${article.title}" class="rec-img">
        <div class="rec-info">
            <h2 class="rec-title">${article.title}</h2>
            <div class="rec-meta">
                <span>By ${article.author}</span>
                <span>•</span>
                <span>${article.date}</span>
            </div>
            <p style="margin-bottom:20px; color:#666; font-size:14px; line-height:1.6;">
                今日のあなたに、ほんの少しの「ゆとり」をお届けします。忙しい毎日の中で立ち止まり、自分と向き合う時間を。
            </p>
            <a href="${article.url}" target="_blank" class="rec-btn">記事を読む</a>
        </div>
    `;
}

// --- Sidebar Rendering ---
function renderSidebar(tags, authorsListStr) {
    const authorListDiv = document.getElementById('author-list');

    authorsListStr.forEach(authorName => {
        // Try to find author details in global 'authors' array if available (from data.js)
        const authorData = (typeof authors !== 'undefined')
            ? authors.find(a => a.name === authorName)
            : null;

        const iconSrc = authorData && authorData.icon ? authorData.icon : null;

        const row = document.createElement('div');
        row.className = 'sidebar-author-row';
        row.onclick = () => filterArticlesByAuthor(authorName);

        let iconHtml;
        if (iconSrc) {
            iconHtml = `<img src="${iconSrc}" class="sidebar-author-img-circle" alt="${authorName}">`;
        } else {
            // Fallback: Colored circle with initial
            const color = generateColor(authorName);
            const initial = authorName.charAt(0);
            iconHtml = `<div class="sidebar-author-img-circle placeholder" style="background-color:${color}">${initial}</div>`;
        }

        row.innerHTML = `
            ${iconHtml}
            <span class="author-name" style="font-size:14px;">${authorName}</span>
        `;
        authorListDiv.appendChild(row);
    });
}

function generateColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Generate soft pastel colors
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 70%)`;
}

function filterArticlesByAuthor(author) {
    const filtered = articles.filter(a => a.author === author);
    renderArticles(filtered);

    const titleEl = document.getElementById('results-title');
    titleEl.textContent = `${author} の記事`;
}

// --- Articles Grid (Magazine Cards) ---
function renderArticles(articleList) {
    const grid = document.getElementById('articles-grid');
    grid.innerHTML = '';

    articleList.forEach(article => {
        const card = document.createElement('article');
        card.className = 'article-card';

        card.innerHTML = `
            <div class="card-img-container">
                <a href="${article.url}" target="_blank">
                    <img src="${article.image || 'hero_bg.png'}" alt="${article.title}" class="card-img">
                </a>
            </div>
            <div class="card-body">
                <div>
                    <a href="${article.url}" target="_blank" class="card-title">${article.title}</a>
                    <div class="card-author">${article.author}</div>
                </div>
                <div style="margin-top:15px; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:12px; color:#999;">${article.date.split(' ')[0]}</span>
                    <a href="${article.url}" target="_blank" class="card-btn">Noteで読む</a>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}
