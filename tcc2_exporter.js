require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');
const driveUploader = require('./drive_uploader');

// 設定
const TCC2_BASE_URL = 'https://taskchute.cloud'; // Base URL
const OUTPUT_DIR = path.join(__dirname, 'output');
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
// const NOTEBOOKLM_NOTEBOOK_URL = process.env.NOTEBOOKLM_NOTEBOOK_URL; // Deprecated in favor of creating new notebooks

// Output directory helper
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Default output logic is moved inside the function to avoid ASAR write errors on require()
const os = require('os');
const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), 'Documents', 'TaskChuteOutput');

module.exports = async function runExport(options = {}) {
    // Default options
    const config = {
        saveScreenshot: true, // Legacy fallback
        actions: options.actions || { screen: true, note: true, notion: false, notebooklm: false },
        dateMode: options.dateMode || 'today',
        specificDate: options.specificDate, // Add this line
        outputDir: options.outputDir || DEFAULT_OUTPUT_DIR,
        url: options.url // Provided URL from options
    };

    // Sync legacy saveScreenshot to actions.screen if not explicitly provided in actions
    if (typeof options.saveScreenshot === 'boolean' && !options.actions) {
        config.actions.screen = options.saveScreenshot;
    }

    // Ensure directory exists
    ensureDir(config.outputDir);

    console.log('--- TaskChute Cloud 2 Export Started ---');
    console.log('Config:', JSON.stringify(config, null, 2));

    // Determine valid user data dir (avoiding ASAR read-only)
    const userDataDir = process.env.USER_DATA_PATH
        ? path.join(process.env.USER_DATA_PATH, 'puppeteer_profile')
        : path.join(__dirname, 'user_data');

    console.log(`Using User Data Dir: ${userDataDir}`);

    const browser = await puppeteer.launch({
        headless: false,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation'], // Hide automation banner
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled', // Mask automation
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        userDataDir: userDataDir
    });

    const pages = await browser.pages();
    const page = pages[0];

    try {
        console.log('TaskChuteCloud2にアクセスします。');
        // ... (rest of function)


        // Calculate Target URL
        let baseUrlString = 'https://taskchute.cloud/users/main';
        if (config.url) {
            const httpMatch = config.url.match(/https?:\/\/[^\s\]"]+/);
            baseUrlString = httpMatch ? httpMatch[0] : config.url.trim();
            try {
                const u = new URL(baseUrlString);
                u.hostname = 'taskchute.cloud';
                baseUrlString = u.toString();
                console.log(`[INFO] URL Domain forced to: ${baseUrlString}`);
            } catch (e) { /* ignore invalid url here, caught later */ }
        }

        // Calculate Target Date Range
        const now = new Date();
        let fromDate = new Date(now);
        let toDate = new Date(now);

        if (config.dateMode === 'yesterday') {
            fromDate.setDate(now.getDate() - 1);
            toDate.setDate(now.getDate() - 1);
        } else if (config.dateMode === 'tomorrow') {
            fromDate.setDate(now.getDate() + 1);
            toDate.setDate(now.getDate() + 1);
        } else if (config.dateMode === 'last-week') {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);

            toDate = new Date(yesterday);
            fromDate = new Date(yesterday);
            fromDate.setDate(yesterday.getDate() - 6);
        } else if (config.dateMode === 'specific' && config.specificDate) {
            fromDate = new Date(config.specificDate);
            toDate = new Date(config.specificDate);
        }

        // Helper to format YYYY-MM-DD
        const formatDate = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dStr = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${dStr}`;
        };

        const dateFileStr = formatDate(fromDate) === formatDate(toDate)
            ? formatDate(fromDate)
            : `${formatDate(fromDate)}_to_${formatDate(toDate)}`;

        // Construct URL
        let targetUrl;
        try {
            const urlObj = new URL(baseUrlString);

            // Set params
            urlObj.searchParams.set('from', formatDate(fromDate));
            urlObj.searchParams.set('to', formatDate(toDate));

            if (formatDate(fromDate) === formatDate(toDate)) {
                urlObj.searchParams.set('date', formatDate(fromDate));
            }

            targetUrl = urlObj.toString();
        } catch (e) {
            console.error('Invalid URL provided, falling back to default:', e);
            targetUrl = `https://taskchute.cloud/users/main?date=${formatDate(fromDate)}`;
        }

        console.log(`Target URL: ${targetUrl}`);

        const TIMEOUT = 90000;

        console.log(`Navigating to: ${targetUrl}`);

        try {
            await page.goto(targetUrl, { timeout: TIMEOUT, waitUntil: 'networkidle2' });
        } catch (e) {
            console.warn(`[WARN] ページ遷移がタイムアウトしましたが、処理を続行します: ${e.message}`);
        }

        // Check if redirected to Login page
        const isLoginPage = await page.evaluate(() => {
            return document.querySelector('input[type="password"]') !== null ||
                document.body.innerText.includes('ログイン') ||
                document.body.innerText.includes('Sign in');
        });

        if (isLoginPage) {
            console.error('[ERROR] ログインページが検出されました。セッションが切れている可能性があります。「1. ログイン設定」から再ログインしてください。');
            throw new Error('Login required');
        }

        // 1. PDF Capture (TaskChute Screen)
        if (config.actions.screen) {
            console.log('画面PDFを生成中...');
            const pdfPath = path.join(config.outputDir, `view_${dateFileStr}.pdf`);

            try {
                console.log('タスクリストの読み込みを待機しています...');
                await page.waitForSelector('div[id^="node_task_"]', { timeout: 15000 });

                // Content Loading and Layout Forcing
                try {
                    // Try to click the first task to focus the list container
                    await page.click('div[id^="node_task_"]');
                } catch (e) {
                    console.log('Focus click failed, continuing...');
                }

                // Keyboard Scroll: Press 'End' to go to bottom
                console.log('キーボード操作(Endキー)でスクロールを実行中...');
                await page.keyboard.press('End');

                // Wait for scroll and load (2 seconds)
                await new Promise(r => setTimeout(r, 2000));

                // Extra safety: Press 'End' again just in case
                await page.keyboard.press('End');
                await new Promise(r => setTimeout(r, 1000));

                const dimensions = await page.evaluate(async () => {
                    // Find the scroll container (simplistic fallback if keyboard worked on 'body' or correct element)
                    // We still need to find it to calculate total height for the "Force Layout" step.
                    // But now we assume the Scroll Phase is done.

                    const taskElement = document.querySelector('div[id^="node_task_"]');
                    let scrollContainer = document.documentElement;
                    if (taskElement) {
                        let current = taskElement.parentElement;
                        while (current && current !== document.body) {
                            const style = window.getComputedStyle(current);
                            if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                                scrollContainer = current;
                                break;
                            }
                            current = current.parentElement;
                        }
                    }

                    console.log('Detected Scroll Container for Layout Force:', scrollContainer);

                    // 2. Force Styles to Expand Content
                    const fullHeight = scrollContainer.scrollHeight;
                    const fullWidth = scrollContainer.scrollWidth;

                    // Force body and container to full height
                    document.body.style.minHeight = fullHeight + 'px';
                    document.body.style.height = 'auto';
                    document.body.style.overflow = 'visible';

                    if (scrollContainer !== document.documentElement) {
                        scrollContainer.style.height = 'auto';
                        scrollContainer.style.maxHeight = 'none';
                        scrollContainer.style.overflow = 'visible';
                    }

                    // Also force all parents to be visible/auto
                    let p = scrollContainer.parentElement;
                    while (p && p !== document.body) {
                        p.style.height = 'auto';
                        p.style.overflow = 'visible';
                        p.style.maxHeight = 'none';
                        p = p.parentElement;
                    }

                    return { width: fullWidth, height: fullHeight };
                });

                // 3. Resize Viewport to match Content (Crucial for page.pdf to see everything)
                // Even though page.pdf re-paginates, the 'window' needs to be big enough to not crop visuals?
                // Actually page.pdf depends on CSS @media print.
                // But setting a large viewport helps avoid virtual scrolling unloading items.
                if (dimensions && dimensions.height > 0) {
                    console.log(`Viewport forced to: ${dimensions.width}x${dimensions.height}`);
                    await page.setViewport({
                        width: Math.max(1280, dimensions.width),
                        height: dimensions.height + 200
                    });
                }

                // 4. Inject Print CSS just in case
                await page.emulateMediaType('print'); // Force emulation of print media
                await page.addStyleTag({
                    content: `
                        @media print {
                            body, html, #__next, .MuiBox-root, div[class*="scroll"], div[style*="overflow"] {
                                overflow: visible !important;
                                height: auto !important; 
                                max-height: none !important;
                            }
                            /* Ensure background colors print */
                            * {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                            }
                        }
                    `
                });

                await page.pdf({
                    path: pdfPath,
                    format: 'A4',
                    printBackground: true,
                    margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
                    scale: 0.7  // Smaller scale to fit more columns
                });

                console.log(`[SUCCESS] 画面PDF保存完了: ${pdfPath}`);

                // Upload to Google Drive if Notion enabled (or if standalone upload requested)
                // We assume if Notion is enabled, we want to upload to Drive to link it.
                // Or maybe we should always upload if configured?
                // For now, let's upload if Notion action is on, OR if we just want to.
                // Let's stick to the plan: Upload if screen=true, and pass link to Notion if notion=true.

                if (config.actions.notion) {
                    try {
                        console.log('Google DriveへPDFをアップロード中...');
                        const driveLink = await driveUploader.uploadFile(pdfPath, `TaskChute_${dateFileStr}.pdf`, 'application/pdf');
                        config.driveLink = driveLink; // Store for Notion step
                        console.log(`[SUCCESS] Drive Upload: ${driveLink}`);
                    } catch (uploadError) {
                        console.error(`[WARN] Google Drive upload failed: ${uploadError.message}`);
                    }
                }

            } catch (e) {
                console.error(`[ERROR] 画面PDF保存失敗: ${e.message}`);
            }
        }

        // 2. Note Extraction (Crawler)
        const extractedTasks = [];

        if (config.actions.note || config.actions.notion) {
            console.log('詳細ページからノート情報を収集中...');

            // Step A: Find all Task IDs from the main list
            const taskIds = await page.evaluate(() => {
                const ids = [];
                // Search for elements with ID starting with 'node_task_'
                const elements = document.querySelectorAll('[id^="node_task_"]');
                elements.forEach(el => {
                    // id="node_task_..." -> "task_..."
                    const realId = el.id.replace(/^node_/, '');
                    if (realId) ids.push(realId);
                });

                // Deduplicate
                return [...new Set(ids)];
            });

            console.log(`検出されたタスクID数: ${taskIds.length}`);

            // Step B: Visit each Task ID to extract details
            for (let i = 0; i < taskIds.length; i++) {
                const taskId = taskIds[i];
                const detailUrl = `https://taskchute.cloud/node/${taskId}`;
                console.log(`Processing (${i + 1}/${taskIds.length}): ${detailUrl}`);

                try {
                    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    // Extract Name and Note
                    // Wait for the task name input to ensure page is loaded
                    try {
                        await page.waitForSelector('input[placeholder*="タスク名"]', { timeout: 5000 });
                    } catch (e) {
                        console.log('タスク詳細の読み込み待ちがタイムアウトしました (続行します)');
                    }

                    const info = await page.evaluate(() => {
                        const nameInput = document.querySelector('input[placeholder*="タスク名"]');
                        const name = nameInput ? nameInput.value : 'No Title';

                        const noteEditor = document.querySelector('[contenteditable="true"][role="textbox"]');
                        const note = noteEditor ? noteEditor.innerText : '';

                        return { name, note: note.trim().substring(0, 5000) };
                    });

                    extractedTasks.push(info);

                    // Small delay to be nice to the server
                    await new Promise(r => setTimeout(r, 500));

                } catch (e) {
                    console.error(`Failed to crawl ${detailUrl}: ${e.message}`);
                }
            }
        }

        const extractedData = { tasks: extractedTasks };

        console.log(`抽出された詳細タスク数: ${extractedData.tasks.length}`);

        // 3. Save Notes (Markdown & PDF)
        if (config.actions.note) {
            // Markdown generation disabled per user request (Step 622 ref)
            /*
            const mdPath = path.join(config.outputDir, `tcc2_notes_${dateFileStr}.md`);
            let mdContent = `# TaskChuteCloud2 Notes (${dateFileStr})\n\n`;

            if (extractedData.tasks.length > 0) {
                mdContent += `## Tasks\n`;
                extractedData.tasks.forEach(item => {
                    mdContent += `- **${item.name}**\n`;
                    if (item.note) {
                        // Indent note for markdown
                        const indentedNote = item.note.split('\n').map(l => '  ' + l).join('\n');
                        mdContent += `${indentedNote}\n`;
                    }
                });
            } else {
                mdContent += `## Tasks\n(タスクが見つかりませんでした)\n`;
            }

            try {
                fs.writeFileSync(mdPath, mdContent);
                console.log(`[SUCCESS] ノートMarkdownを保存しました: ${mdPath}`);
            } catch (e) {
                console.error(`[ERROR] ノートMarkdown保存失敗: ${e.message}`);
            }
            */

            // PDF
            try {
                console.log('ノートPDFを生成中...');
                let htmlContent = `
                    <html>
                    <head>
                        <style>
                            body { font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", "Hiragino Sans", sans-serif; padding: 40px; color: #333; }
                            h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                            ul { list-style-type: none; padding: 0; }
                            li { margin-bottom: 15px; page-break-inside: avoid; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                            .task-name { font-weight: bold; font-size: 16px; margin-bottom: 5px; color: #000; }
                            .task-note { color: #555; white-space: pre-wrap; font-size: 14px; margin-left: 15px; line-height: 1.5; background: #f9f9f9; padding: 10px; border-radius: 4px; }
                        </style>
                    </head>
                    <body>
                        <h1>Task Notes (${dateFileStr})</h1>
                        <ul>
                    `;

                if (extractedData.tasks.length > 0) {
                    extractedData.tasks.forEach(task => {
                        htmlContent += `<li><div class="task-name">${task.name ? task.name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(No Name)'}</div>`;
                        if (task.note) {
                            const safeNote = task.note.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                            htmlContent += `<div class="task-note">${safeNote}</div>`;
                        }
                        htmlContent += `</li>`;
                    });
                } else {
                    htmlContent += `<p>No tasks found.</p>`;
                }
                htmlContent += `</ul></body></html>`;

                // Just use the existing page to render HTML then print
                // But we navigated away. So we use the current page (which is on the last task)
                // Or best to open a blank page?
                // The current page is fine if we replace content.
                await page.setContent(htmlContent);

                const notePdfPath = path.join(config.outputDir, `tcc2_notes_${dateFileStr}.pdf`);
                await page.pdf({ path: notePdfPath, format: 'A4', margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' } });
                console.log(`[SUCCESS] ノートPDFを保存しました: ${notePdfPath}`);

            } catch (pdfError) {
                console.error('[ERROR] ノートPDF生成中にエラー:', pdfError);
            }
        }

        // 4. Save to Notion
        if (config.actions.notion) {
            await saveToNotion(extractedData.tasks, dateFileStr, config.driveLink);
        }

        // 5. Upload to NotebookLM
        if (config.actions.notebooklm) {
            // Use screen PDF if available, otherwise note PDF (fallback)
            // We should probably prefer the screen PDF as it's the "Daily Log" visual.
            const pdfPath = config.actions.screen
                ? path.join(config.outputDir, `view_${dateFileStr}.pdf`)
                : path.join(config.outputDir, `tcc2_notes_${dateFileStr}.pdf`);

            if (fs.existsSync(pdfPath)) {
                await uploadToNotebookLM(page, pdfPath);
            } else {
                console.warn('[WARN] NotebookLMへのアップロードをスキップ: PDFファイルが見つかりません');
            }
        }

    } catch (error) {
        console.error('致命的なエラー:', error);
        throw error; // エラーを呼び出し元に伝える
    } finally {
        // Only close if we didn't crash? 
        // We always close.
        if (browser) await browser.close();
        console.log('ブラウザを閉じました。');
    }
};


async function saveToNotion(tasks, dateStr, driveLink) {
    if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
        console.log('Notionの認証情報が設定されていないため、Notionへの保存はスキップします。(.envを確認してください)');
        return;
    }

    console.log('Notionへの保存を開始します...');
    const notion = new Client({ auth: NOTION_API_KEY });

    try {
        // コンテンツブロックの作成
        const children = [];

        if (tasks.length === 0) {
            children.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ type: 'text', text: { content: 'タスクは見つかりませんでした。' } }]
                }
            });
        } else {
            tasks.forEach(task => {
                // タスク名
                children.push({
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: {
                        rich_text: [{ type: 'text', text: { content: task.name } }]
                    }
                });

                // ノートがある場合はインデントして表示
                if (task.note) {
                    children.push({
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{ type: 'text', text: { content: `Note: ${task.note}` } }],
                            color: 'gray'
                        }
                    });
                }
            });
        }

        // Add PDF Link if available
        if (driveLink) {
            children.push({
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: [{ type: 'text', text: { content: 'PDF Archive' } }]
                }
            });
            children.push({
                object: 'block',
                type: 'bookmark',
                bookmark: {
                    url: driveLink
                }
            });
            children.push({
                object: 'block',
                type: 'divider',
                divider: {}
            });
        }

        const response = await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            properties: {
                Name: {
                    title: [
                        {
                            text: {
                                content: `TaskChuteCloud2 Notes (${dateStr})`,
                            },
                        },
                    ],
                },
                Date: {
                    date: {
                        start: dateStr
                    }
                }
            },
            children: children,
        });

        console.log(`Notionに保存しました: ${response.url}`);
    } catch (error) {
        console.error('Notionへの保存中にエラーが発生しました:', error.body || error);
    }
}

async function uploadToNotebookLM(page, pdfPath) {
    console.log('NotebookLMへのアップロードを開始します (新規ノートブック作成)...');
    try {
        await page.goto('https://notebooklm.google.com/', { waitUntil: 'networkidle0', timeout: 60000 });

        // 1. Check for "New Notebook" button first (Success indicator)
        const newNotebookBtnExists = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('div, button, span'));
            // Look for "New notebook" or "新しいノートブック" strictly in relevant elements
            // Also excluding hidden elements might be good, but innerText usually handles that.
            return elements.some(el =>
                (el.innerText && (el.innerText.includes('New notebook') || el.innerText.includes('新しいノートブック'))) ||
                (el.ariaLabel && (el.ariaLabel.includes('New notebook') || el.ariaLabel.includes('新しいノートブック')))
            );
        });

        if (newNotebookBtnExists) {
            console.log('ログイン済みを確認しました (新規作成ボタン検出)。');
        } else {
            // Only check for login page if we didn't find the success indicator
            const isLoginPage = await page.evaluate(() => {
                return document.body.innerText.includes('Sign in') || document.body.innerText.includes('ログイン');
            });

            if (isLoginPage) {
                console.log('[WARN] NotebookLMのログインが必要です。ブラウザでログインしてください。完了を待機します(最大3分)...');

                // Wait loop
                for (let i = 0; i < 36; i++) {
                    await new Promise(r => setTimeout(r, 5000));

                    const canSeeNewBtn = await page.evaluate(() => {
                        const elements = Array.from(document.querySelectorAll('div, button, span'));
                        return elements.some(el =>
                            (el.innerText && (el.innerText.includes('New notebook') || el.innerText.includes('新しいノートブック'))) ||
                            (el.ariaLabel && (el.ariaLabel.includes('New notebook') || el.ariaLabel.includes('新しいノートブック')))
                        );
                    });

                    if (canSeeNewBtn) {
                        console.log('ログイン完了を検出しました。');
                        break;
                    }
                }
            }
        }

        console.log('「新しいノートブック」ボタンを探しています...');

        // 1. Click "New Notebook"
        const created = await page.evaluate(async () => {
            // Helper to match text
            const containsText = (el, text) => el.innerText && el.innerText.includes(text);

            // Potential selectors for the "New Notebook" card/button
            const elements = Array.from(document.querySelectorAll('div, button, span'));
            // Look for "New notebook" or "新しいノートブック"
            const newBtn = elements.find(el =>
                (containsText(el, 'New notebook') || containsText(el, '新しいノートブック') || containsText(el, 'Create')) &&
                el.role !== 'dialog'
            );

            if (newBtn) {
                newBtn.click();
                return true;
            }
            return false;
        });

        if (!created) {
            console.log('テキストでのボタン検出に失敗しました。アイコンまたは位置でのクリックを試みます...');
            // Material Design "New" often has aria-label
            const ariaBtn = await page.$('[aria-label*="New"], [aria-label*="Create"], [aria-label*="新しい"], [aria-label*="作成"]');
            if (ariaBtn) {
                await ariaBtn.click();
            } else {
                console.error('[ERROR] 新規作成ボタンが見つかりませんでした。');
                return;
            }
        }

        // Wait for navigation to the new notebook
        await new Promise(r => setTimeout(r, 5000));

        // 2. Set Title
        // Use local time for the title
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const newTitle = `TaskChute Log ${y}-${m}-${d}`;

        console.log(`ノートブックのタイトルを "${newTitle}" に設定します...`);

        await page.evaluate((title) => {
            const titleInput = document.querySelector('input[placeholder="Untitled notebook"], input[placeholder="無題のノートブック"], textarea[aria-label="Notebook title"]');
            if (titleInput) {
                titleInput.value = title;
                titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                titleInput.dispatchEvent(new Event('change', { bubbles: true }));
                titleInput.blur();
            }
        }, newTitle);

        // 3. Upload File
        console.log('ファイルアップロード場所を探しています...');

        // Wait for page stabilization
        await new Promise(r => setTimeout(r, 2000));

        let fileInput = await page.$('input[type="file"]');

        if (!fileInput) {
            // Try to find "Add source" button again inside the notebook
            const addedSource = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
                // Expanded check including aria-label and "Upload" text
                const addSourceBtn = buttons.find(b =>
                    (b.innerText && (b.innerText.includes('Add source') || b.innerText.includes('ソースを追加') || b.innerText.includes('PDF') || b.innerText.includes('アップロード'))) ||
                    (b.ariaLabel && (b.ariaLabel.includes('Add source') || b.ariaLabel.includes('ソースを追加') || b.ariaLabel.includes('Upload')))
                );
                if (addSourceBtn) {
                    addSourceBtn.click();
                    return true;
                }
                return false;
            });

            if (addedSource) {
                await new Promise(r => setTimeout(r, 2000));
                fileInput = await page.$('input[type="file"]');
            }
        }

        if (fileInput) {
            console.log(`Uploading PDF: ${pdfPath}`);
            await fileInput.uploadFile(pdfPath);

            console.log('Waiting for upload processing...');
            await new Promise(r => setTimeout(r, 15000));
            console.log('[SUCCESS] NotebookLMへのアップロード完了 (待機終了)');
        } else {
            // Try to click "Upload" text as last resort
            console.log('アップロードボタンをテキスト検索でクリックを試みます...');
            const clicked = await page.evaluate(() => {
                const candidates = Array.from(document.querySelectorAll('div, span, button, p'));
                const target = candidates.find(el =>
                    el.innerText && (el.innerText.includes('ファイルをアップロード') || el.innerText.includes('Upload file'))
                );
                if (target) {
                    target.click();
                    return true;
                }
                return false;
            });

            if (clicked) {
                await new Promise(r => setTimeout(r, 2000));
                fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.uploadFile(pdfPath);
                    console.log('[SUCCESS] テキストクリック後にアップロード開始');
                    await new Promise(r => setTimeout(r, 15000));
                    return;
                }
            }

            console.error('[ERROR] NotebookLMのファイルアップロード入力箇所が見つかりませんでした。');
            const debugPath = 'debug_upload_fail.png';
            await page.screenshot({ path: debugPath, fullPage: true });
            console.log(`デバッグ用スクリーンショットを保存しました: ${debugPath}`);
        }

    } catch (e) {
        console.error(`[ERROR] NotebookLM Upload failed: ${e.message}`);
        try {
            const debugPath = 'debug_crash.png';
            await page.screenshot({ path: debugPath });
            console.log(`クラッシュ時スクリーンショット: ${debugPath}`);
        } catch (err) { }
    }
}
