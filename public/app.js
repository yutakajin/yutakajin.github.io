// public/app.js

const API_Base = '/api';

// DOM Elements
const jobsListEl = document.getElementById('jobs-list');
const scheduleForm = document.getElementById('schedule-form');
const loginBtn = document.getElementById('login-btn');
const statusMessageEl = document.getElementById('status-message');

// Functions
function showStatus(message, type = 'info') {
    statusMessageEl.textContent = message;
    statusMessageEl.className = `status-${type}`;
    // エラー以外は5秒で消す、エラーはずっと表示でもいいが一旦統一
    setTimeout(() => {
        statusMessageEl.textContent = '';
        statusMessageEl.className = '';
    }, 5000);
}

async function fetchJobs() {
    try {
        const res = await fetch(`${API_Base}/jobs`);
        const jobs = await res.json();
        renderJobs(jobs);
    } catch (error) {
        showStatus('スケジュールの読み込みに失敗しました。', 'error');
        console.error(error);
    }
}

const SCHEDULE_LIMIT = 1;

function renderJobs(jobs) {
    jobsListEl.innerHTML = '';
    const submitBtn = document.querySelector('button[type="submit"]');

    if (jobs.length >= SCHEDULE_LIMIT) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'スケジュールは1つまでです';
        submitBtn.style.opacity = '0.5';
        submitBtn.style.cursor = 'not-allowed';
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = 'スケジュールに追加';
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
    }

    if (jobs.length === 0) {
        jobsListEl.innerHTML = '<p class="text-muted">登録されたスケジュールはありません。</p>';
        return;
    }

    jobs.forEach(job => {
        const div = document.createElement('div');
        div.className = 'job-card';

        let dateText = '今日';
        if (job.dateMode === 'yesterday') dateText = '昨日';
        if (job.dateMode === 'tomorrow') dateText = '明日';
        if (job.dateMode === 'specific') dateText = `指定日`;

        div.innerHTML = `
            <div class="job-info">
                <strong>毎日 ${job.time}</strong> - 対象: ${dateText}
                <br>
                <small style="color: #94a3b8;">画面PDF + ノートPDF</small>
            </div>
            <div class="job-actions" style="display: flex; gap: 0.5rem;">
                <button onclick="runJob('${job.id}')" class="btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">今すぐ実行</button>
                <button onclick="deleteJob('${job.id}')" class="btn-danger">削除</button>
            </div>
        `;
        jobsListEl.appendChild(div);
    });
}

async function login() {
    loginBtn.disabled = true;
    showStatus('ブラウザを起動しています...', 'info');

    // URL input value
    const url = document.getElementById('url').value;

    try {
        await fetch(`${API_Base}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        showStatus('ブラウザが閉じられました。セッションを保存しました。', 'success');
    } catch (error) {
        showStatus('ログインセッションが予期せず終了しました。', 'error');
    } finally {
        loginBtn.disabled = false;
    }
}

async function deleteJob(id) {
    if (!confirm('本当に削除しますか？')) return;

    try {
        await fetch(`${API_Base}/jobs/${id}`, { method: 'DELETE' });
        showStatus('スケジュールを削除しました。', 'success');
        fetchJobs();
    } catch (error) {
        showStatus('削除に失敗しました。', 'error');
    }
}

async function runJob(id) {
    if (!confirm('今すぐ実行しますか？')) return;
    showStatus('実行を開始しました... (ブラウザがバックグラウンドで動きます)', 'info');

    try {
        const res = await fetch(`${API_Base}/jobs/${id}/run`, { method: 'POST' });
        const result = await res.json();

        if (result.success) {
            showStatus('実行が完了しました！', 'success');
            setTimeout(() => alert('実行成功：PDFとノートが保存されました！'), 100);
        } else {
            showStatus(`エラー: ${result.message}`, 'error');
            alert(`実行エラー:\n${result.message}`);
        }
    } catch (error) {
        showStatus('実行リクエストに失敗しました。', 'error');
        alert('実行リクエストに失敗しました（サーバーエラー）');
    }
}


// Event Listeners
loginBtn.addEventListener('click', login);
const dateModeSelect = document.getElementById('date-mode');
const specificDateInput = document.getElementById('specific-date');

// Toggle Specific Date
dateModeSelect.addEventListener('change', () => {
    if (dateModeSelect.value === 'specific') {
        specificDateInput.style.display = 'block';
        if (!specificDateInput.value) {
            specificDateInput.value = new Date().toISOString().split('T')[0];
        }
    } else {
        specificDateInput.style.display = 'none';
    }
});

// Schedule Form Submit
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = document.getElementById('url').value;
    const outputDir = document.getElementById('output-dir').value;
    const time = document.getElementById('schedule-time').value;
    const dateMode = document.getElementById('date-mode').value;
    const specificDate = document.getElementById('specific-date').value;

    // Default values (Simplified)
    const frequency = 'daily';
    const actions = {
        screen: true,
        note: true, // Re-enabled (PDF Only)
        notion: false
    };

    try {
        const res = await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url, outputDir, time, dateMode, actions,
                frequency, weekdays: [], specificDate
            })
        });

        if (res.ok) {
            showStatus('スケジュールを登録しました', 'success');
            fetchJobs();
        } else {
            const err = await res.json();
            showStatus(`エラー: ${err.message}`, 'error');
        }
    } catch (error) {
        showStatus(`通信エラー: ${error.message}`, 'error');
    }
});

// Execute Now (Immediate)
async function executeNowBtn() {
    const url = document.getElementById('url').value;
    const outputDir = document.getElementById('output-dir').value;
    const dateMode = document.getElementById('date-mode').value;
    const specificDate = document.getElementById('specific-date').value;

    const actions = {
        screen: true,
        note: true, // Re-enabled (PDF Only)
        notion: false
    };

    if (!url || !outputDir) {
        showStatus('URLと保存先を入力してください', 'error');
        return;
    }

    if (confirm('設定された内容で今すぐ実行しますか？')) {
        showStatus('実行中... (これには数分かかる場合があります)', 'success');
        try {
            const res = await fetch('/api/execute-immediate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url, outputDir, dateMode, actions, specificDate
                })
            });

            const data = await res.json();
            if (data.success) {
                showStatus('実行が完了しました', 'success');
            } else {
                showStatus(`実行失敗: ${data.message}`, 'error');
            }
        } catch (error) {
            showStatus(`通信エラー: ${error.message}`, 'error');
        }
    }
}

document.getElementById('execute-now-btn').addEventListener('click', executeNowBtn);


// Initial Load
fetchJobs();

// Load persisted inputs from localStorage
const savedUrl = localStorage.getItem('tcc2_url');
const savedOutputDir = localStorage.getItem('tcc2_output_dir');

if (savedUrl) document.getElementById('url').value = savedUrl;
if (savedOutputDir) document.getElementById('output-dir').value = savedOutputDir;

// Save inputs on change
const urlInput = document.getElementById('url');
const outputDirInput = document.getElementById('output-dir');

urlInput.addEventListener('change', () => {
    localStorage.setItem('tcc2_url', urlInput.value);
});

outputDirInput.addEventListener('change', () => {
    localStorage.setItem('tcc2_output_dir', outputDirInput.value);
});

// Also save on submit/execute to be sure
function saveInputs() {
    localStorage.setItem('tcc2_url', urlInput.value);
    localStorage.setItem('tcc2_output_dir', outputDirInput.value);
}

// Attach saveInputs to submit and execute
document.getElementById('schedule-form').addEventListener('submit', saveInputs);
document.getElementById('execute-now-btn').addEventListener('click', saveInputs);

// Global for onclick
window.deleteJob = deleteJob;
window.runJob = runJob;

// Render Jobs
function renderJobs(jobs) {
    const list = document.getElementById('jobs-list');
    list.innerHTML = '';

    console.log(jobs);

    if (jobs.length === 0) {
        list.innerHTML = '<p style="color: #94a3b8; text-align: center;">登録されたスケジュールはありません</p>';
        return;
    }

    jobs.forEach(job => {
        const div = document.createElement('div');
        div.className = 'job-item';

        let freqText = '毎日';
        if (job.frequency === 'weekly') {
            const dayMap = ['日', '月', '火', '水', '木', '金', '土'];
            const days = (job.weekdays || []).map(d => dayMap[d]).join(', ');
            freqText = `毎週 [${days}]`;
        }

        div.innerHTML = `
            <div>
                <strong>${job.time} (${freqText})</strong><br>
                <span style="font-size: 0.8rem; color: #94a3b8;">${job.url.substring(0, 40)}...</span>
            </div>
            <button class="btn-delete" onclick="deleteJob('${job.id}')">削除</button>
        `;
        list.appendChild(div);
    });
}
