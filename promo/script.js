// State management
let currentFilter = {
    type: 'all', // 'all', 'category', 'tag', 'author'
    value: null
};
let displayedCount = 24;
const PAGE_SIZE = 24;
let filteredArticles = [];

document.addEventListener('DOMContentLoaded', () => {
    // Collect all unique authors
    const authorsList = [...new Set(articles.map(a => a.author))];

    // Initialize UI components
    renderRecommendation();
    renderCategories();
    renderTagCloud();
    renderSidebar(authorsList);

    // Initial render: all articles
    filteredArticles = articles;
    renderArticles();

    // Setup event listeners
    setupToggleButtons();
    setupResetButton();
    setupLoadMoreButton();
});

// --- Today's Recommendation Banner ---
function renderRecommendation() {
    const container = document.getElementById('recommendation-banner');
    if (!container || !articles.length) return;

    // Pick random article
    const randomIndex = Math.floor(Math.random() * articles.length);
    const article = articles[randomIndex];

    const tagBadgesHtml = (article.tags || []).slice(0, 3)
        .map(t => `<span class="rec-tag" onclick="event.stopPropagation(); filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`)
        .join(' ');

    const categoryBadgeHtml = article.category 
        ? `<span class="rec-cat" onclick="event.stopPropagation(); filterByCategory('${escapeHtml(article.category)}')">${escapeHtml(article.category)}</span>` 
        : '';

    const summaryText = article.summary || '「時間がない」毎日から、あなたらしい豊かな時間へ。日々の気づきとヒントをお届けします。';

    container.innerHTML = `
        <img src="${article.image || 'hero_bg.png'}" alt="${escapeHtml(article.title)}" class="rec-img">
        <div class="rec-info">
            <div class="rec-badges">
                ${categoryBadgeHtml}
                ${tagBadgesHtml}
            </div>
            <h2 class="rec-title">${escapeHtml(article.title)}</h2>
            <div class="rec-meta">
                <span>By ${escapeHtml(article.author)}</span>
                <span>•</span>
                <span>${escapeHtml(article.date)}</span>
            </div>
            <p class="rec-summary">
                ${escapeHtml(summaryText)}
            </p>
            <div class="rec-actions">
                <a href="${article.url}" target="_blank" class="rec-btn">記事を読む（Note）</a>
            </div>
        </div>
    `;
}

// --- Category Tabs Rendering ---
function renderCategories() {
    const container = document.getElementById('category-tabs');
    if (!container) return;

    // Categories list: All + categories from data.js
    const categoryList = (typeof categories !== 'undefined' && categories.length > 0)
        ? categories
        : [
            { name: '仕事術・生産性', count: 210 },
            { name: '習慣化・時間術', count: 180 },
            { name: '講座・イベント・コミュニティ', count: 105 },
            { name: 'マインド・順算思考', count: 93 },
            { name: 'タスクシュート実践・機能', count: 90 },
            { name: 'ライフ・健康・日常', count: 33 }
        ];

    let html = `
        <button type="button" class="category-pill ${currentFilter.type === 'all' ? 'active' : ''}" onclick="resetFilter()">
            <span>すべて</span>
            <span class="pill-count">${articles.length}</span>
        </button>
    `;

    categoryList.forEach(cat => {
        const isActive = (currentFilter.type === 'category' && currentFilter.value === cat.name);
        html += `
            <button type="button" class="category-pill ${isActive ? 'active' : ''}" onclick="filterByCategory('${escapeHtml(cat.name)}')">
                <span>${escapeHtml(cat.name)}</span>
                <span class="pill-count">${cat.count}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

// --- Tag Cloud Rendering ---
function renderTagCloud() {
    const container = document.getElementById('tag-cloud');
    if (!container) return;

    const tagsToRender = (typeof popularTags !== 'undefined' && popularTags.length > 0)
        ? popularTags.slice(0, 25)
        : [];

    let html = '';
    tagsToRender.forEach(tagItem => {
        const isActive = (currentFilter.type === 'tag' && currentFilter.value === tagItem.name);
        html += `
            <button type="button" class="tag-chip ${isActive ? 'active' : ''}" onclick="filterByTag('${escapeHtml(tagItem.name)}')">
                <span class="tag-name">#${escapeHtml(tagItem.name)}</span>
                <span class="tag-count">${tagItem.count}</span>
            </button>
        `;
    });

    container.innerHTML = html;
}

// --- Sidebar Authors Rendering ---
function renderSidebar(authorsListStr) {
    const authorListDiv = document.getElementById('author-list');
    if (!authorListDiv) return;

    authorListDiv.innerHTML = '';
    authorsListStr.forEach(authorName => {
        const authorData = (typeof authors !== 'undefined')
            ? authors.find(a => a.name === authorName)
            : null;

        const iconSrc = authorData && authorData.icon ? authorData.icon : null;

        const row = document.createElement('div');
        const isActive = (currentFilter.type === 'author' && currentFilter.value === authorName);
        row.className = `sidebar-author-row ${isActive ? 'active' : ''}`;
        row.onclick = () => filterByAuthor(authorName);

        let iconHtml;
        if (iconSrc) {
            iconHtml = `<img src="${iconSrc}" class="sidebar-author-img-circle" alt="${escapeHtml(authorName)}">`;
        } else {
            const color = generateColor(authorName);
            const initial = authorName.charAt(0);
            iconHtml = `<div class="sidebar-author-img-circle placeholder" style="background-color:${color}">${initial}</div>`;
        }

        row.innerHTML = `
            ${iconHtml}
            <span class="author-name" style="font-size:14px;">${escapeHtml(authorName)}</span>
        `;
        authorListDiv.appendChild(row);
    });
}

function generateColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 70%)`;
}

// --- Filter Logic ---
function filterByCategory(categoryName) {
    currentFilter = { type: 'category', value: categoryName };
    filteredArticles = articles.filter(a => a.category === categoryName);
    displayedCount = PAGE_SIZE;

    updateUI();
    scrollToResults();
}

function filterByTag(tagName) {
    currentFilter = { type: 'tag', value: tagName };
    filteredArticles = articles.filter(a => Array.isArray(a.tags) && a.tags.includes(tagName));
    displayedCount = PAGE_SIZE;

    updateUI();
    scrollToResults();
}

function filterByAuthor(authorName) {
    currentFilter = { type: 'author', value: authorName };
    filteredArticles = articles.filter(a => a.author === authorName);
    displayedCount = PAGE_SIZE;

    updateUI();
    scrollToResults();
}

function resetFilter() {
    currentFilter = { type: 'all', value: null };
    filteredArticles = articles;
    displayedCount = PAGE_SIZE;

    updateUI();
}

function updateUI() {
    renderCategories();
    renderTagCloud();
    const authorsList = [...new Set(articles.map(a => a.author))];
    renderSidebar(authorsList);

    // Update active filter status bar
    const filterBar = document.getElementById('active-filter-bar');
    const labelEl = document.getElementById('active-filter-label');
    const countEl = document.getElementById('active-filter-count');
    const titleEl = document.getElementById('results-title');
    const subtitleEl = document.getElementById('results-subtitle');

    if (currentFilter.type === 'all') {
        if (filterBar) filterBar.style.display = 'none';
        if (titleEl) titleEl.textContent = '最近の記事';
        if (subtitleEl) subtitleEl.textContent = `全 ${articles.length} 件`;
    } else {
        if (filterBar) filterBar.style.display = 'flex';
        
        let labelText = '';
        if (currentFilter.type === 'category') {
            labelText = `📂 カテゴリ: ${currentFilter.value}`;
            if (titleEl) titleEl.textContent = `${currentFilter.value} の記事`;
        } else if (currentFilter.type === 'tag') {
            labelText = `🏷️ タグ: #${currentFilter.value}`;
            if (titleEl) titleEl.textContent = `#${currentFilter.value} の記事`;
        } else if (currentFilter.type === 'author') {
            labelText = `✍️ 執筆者: ${currentFilter.value}`;
            if (titleEl) titleEl.textContent = `${currentFilter.value} さんの記事`;
        }

        if (labelEl) labelEl.textContent = labelText;
        if (countEl) countEl.textContent = `(${filteredArticles.length}件)`;
        if (subtitleEl) subtitleEl.textContent = `${filteredArticles.length} Articles`;
    }

    renderArticles();
}

function scrollToResults() {
    const el = document.getElementById('results-title');
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// --- Articles Grid (Magazine Cards) ---
function renderArticles() {
    const grid = document.getElementById('articles-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const sliceToDisplay = filteredArticles.slice(0, displayedCount);

    if (sliceToDisplay.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <p>該当する記事が見つかりませんでした。</p>
                <button type="button" class="rec-btn" onclick="resetFilter()" style="margin-top:15px;">全記事を表示する</button>
            </div>
        `;
        updateLoadMoreButton();
        return;
    }

    sliceToDisplay.forEach(article => {
        const card = document.createElement('article');
        card.className = 'article-card';

        // Tag badges
        const tagsHtml = (article.tags || []).slice(0, 3).map(tag => 
            `<span class="card-tag" onclick="event.stopPropagation(); filterByTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`
        ).join('');

        // Category badge
        const categoryBadge = article.category 
            ? `<span class="card-category-badge" onclick="event.stopPropagation(); filterByCategory('${escapeHtml(article.category)}')">${escapeHtml(article.category)}</span>`
            : '';

        // Summary snippet
        const summarySnippet = article.summary 
            ? `<p class="card-summary">${escapeHtml(article.summary)}</p>` 
            : '';

        card.innerHTML = `
            <div class="card-img-container">
                <a href="${article.url}" target="_blank">
                    <img src="${article.image || 'hero_bg.png'}" alt="${escapeHtml(article.title)}" class="card-img" loading="lazy">
                </a>
                ${categoryBadge}
            </div>
            <div class="card-body">
                <div>
                    <a href="${article.url}" target="_blank" class="card-title">${escapeHtml(article.title)}</a>
                    <div class="card-author">
                        <span class="author-name-link" onclick="filterByAuthor('${escapeHtml(article.author)}')">By ${escapeHtml(article.author)}</span>
                    </div>
                    ${summarySnippet}
                </div>
                <div class="card-footer">
                    <div class="card-tags-list">
                        ${tagsHtml}
                    </div>
                    <div class="card-meta-row">
                        <span class="card-date">${article.date ? article.date.split(' ')[0] : ''}</span>
                        <a href="${article.url}" target="_blank" class="card-btn">Noteで読む</a>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    const container = document.getElementById('load-more-container');
    const remainingCountEl = document.getElementById('remaining-count');
    if (!container) return;

    const remaining = filteredArticles.length - displayedCount;
    if (remaining > 0) {
        container.style.display = 'block';
        if (remainingCountEl) remainingCountEl.textContent = remaining;
    } else {
        container.style.display = 'none';
    }
}

// --- Setup Event Listeners ---
function setupToggleButtons() {
    // Author toggle (mobile)
    const authorToggleBtn = document.getElementById('author-toggle-btn');
    const authorListDiv = document.getElementById('author-list');
    if (authorToggleBtn && authorListDiv) {
        authorToggleBtn.addEventListener('click', () => {
            const isOpen = authorListDiv.classList.toggle('is-open');
            authorToggleBtn.classList.toggle('is-open', isOpen);
            authorToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            const btnText = authorToggleBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = isOpen ? '執筆者一覧を閉じる' : '執筆者一覧を見る';
            }
        });
    }

    // Tag toggle (mobile)
    const tagToggleBtn = document.getElementById('tag-toggle-btn');
    const tagCloudDiv = document.getElementById('tag-cloud');
    if (tagToggleBtn && tagCloudDiv) {
        tagToggleBtn.addEventListener('click', () => {
            const isOpen = tagCloudDiv.classList.toggle('is-open');
            tagToggleBtn.classList.toggle('is-open', isOpen);
            tagToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            const btnText = tagToggleBtn.querySelector('.btn-text');
            if (btnText) {
                btnText.textContent = isOpen ? 'タグ一覧を閉じる' : '🏷️ 内容別タグを見る';
            }
        });
    }
}

function setupResetButton() {
    const resetBtn = document.getElementById('reset-filter-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetFilter);
    }
}

function setupLoadMoreButton() {
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            displayedCount += PAGE_SIZE;
            renderArticles();
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
