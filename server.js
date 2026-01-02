const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const puppeteer = require('puppeteer');
const crypto = require('crypto');

// Import TCC2 Exporter logic
const runExport = require('./tcc2_exporter');

const PORT = 3000;

// Determine base directory for data storage
// If running in Electron (process.env.USER_DATA_PATH is set), use that.
// Otherwise (dev/node), use local directory.
const DATA_BASE_DIR = process.env.USER_DATA_PATH || __dirname;

// Ensure directory exists if it's the userData path
if (process.env.USER_DATA_PATH && !fs.existsSync(DATA_BASE_DIR)) {
    try { fs.mkdirSync(DATA_BASE_DIR, { recursive: true }); } catch (e) { }
}

const DB_FILE = path.join(DATA_BASE_DIR, 'db.json');

// Align Puppeteer profile path with tcc2_exporter.js
// Prod (Electron): USER_DATA_PATH/puppeteer_profile
// Dev: __dirname/user_data
const USER_DATA_DIR = process.env.USER_DATA_PATH
    ? path.join(process.env.USER_DATA_PATH, 'puppeteer_profile')
    : path.join(__dirname, 'user_data');

console.log(`Using data directory: ${DATA_BASE_DIR}`);
console.log(`Using puppeteer profile: ${USER_DATA_DIR}`);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Helpers
function readDb() {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        const data = fs.readFileSync(DB_FILE);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Scheduler Manager
const activeTasks = {};

function startJob(job) {
    console.log(`Starting scheduler for job ${job.id} with schedule ${job.schedule}`);

    // Validate Cron
    if (!cron.validate(job.schedule)) {
        console.error(`Invalid cron schedule for job ${job.id}: ${job.schedule}`);
        return;
    }

    const task = cron.schedule(job.schedule, async () => {
        console.log(`[${new Date().toISOString()}] Running job ${job.id}`);
        try {
            await executeExport(job);
            console.log(`Job ${job.id} completed successfully.`);
        } catch (error) {
            console.error(`Job ${job.id} failed:`, error);
        }
    });

    activeTasks[job.id] = task;
}

function stopJob(jobId) {
    if (activeTasks[jobId]) {
        activeTasks[jobId].stop();
        delete activeTasks[jobId];
        console.log(`Stopped job ${jobId}`);
    }
}

async function executeExport(job) {
    // Determine target date based on dateMode at the time of execution
    // dateMode is passed to exporter, and exporter handles calculation?
    // Or we handle it here. Exporter is better since it runs in the context of the execution time.

    // Default actions if not present (legacy jobs)
    const actions = job.actions || { screen: true, note: true, notion: false };
    const dateMode = job.dateMode || 'today';
    const outputDir = job.outputDir;

    await runExport({
        saveScreenshot: actions.screen, // Legacy mapping
        actions: actions,
        dateMode: dateMode,
        specificDate: job.specificDate, // Pass specific date if present
        outputDir: outputDir,
        url: job.url // Pass the custom URL from job definition
    });
}

// Initialize Jobs on Startup
const initialJobs = readDb();
initialJobs.forEach(startJob);


// Routes

// 1. List Jobs
app.get('/api/jobs', (req, res) => {
    const jobs = readDb();
    res.json(jobs);
});

// 2. Add Job
app.post('/api/jobs', (req, res) => {
    // START: Server-side limit check
    const currentJobs = readDb();
    if (currentJobs.length >= 1) {
        return res.status(400).json({ message: '登録できるスケジュールは1つまでです。既存のものを削除してください。' });
    }
    // END: Server-side limit check

    const { url, time, outputDir, dateMode, actions, frequency, weekdays } = req.body;

    if (!url || !time || !outputDir) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    // Convert Time (HH:MM) to Cron
    // Daily: 0 MM HH * * *
    // Weekly: 0 MM HH * * 1,3 (Mon, Wed)
    const [hour, minute] = time.split(':');
    let schedule = `0 ${minute} ${hour} * * *`;

    if (frequency === 'weekly' && weekdays && weekdays.length > 0) {
        const daysStr = weekdays.join(',');
        schedule = `0 ${minute} ${hour} * * ${daysStr}`;
    }

    const newJob = {
        id: crypto.randomUUID(),
        url,
        time, // Keep original time for display
        schedule,
        frequency: frequency || 'daily',
        weekdays: weekdays || [],
        outputDir,
        dateMode: dateMode || 'today',
        actions: actions || { screen: true, note: true, notion: false },
        type: 'cron',
        createdAt: new Date().toISOString()
    };

    const jobs = readDb();
    jobs.push(newJob);
    writeDb(jobs);

    startJob(newJob);

    res.json(newJob);
});

// 3. Delete Job
app.delete('/api/jobs/:id', (req, res) => {
    const { id } = req.params;
    let jobs = readDb();
    const jobIndex = jobs.findIndex(j => j.id === id);

    if (jobIndex === -1) {
        return res.status(404).json({ message: 'Job not found' });
    }

    stopJob(id);
    jobs.splice(jobIndex, 1);
    writeDb(jobs);

    res.json({ message: 'Job deleted' });
});

// 4. Run Job Immediately
app.post('/api/jobs/:id/run', async (req, res) => {
    const { id } = req.params;
    const jobs = readDb();
    const job = jobs.find(j => j.id === id);

    if (!job) {
        return res.status(404).json({ success: false, message: 'Job not found' });
    }

    console.log(`Manual trigger for job ${id}`);

    try {
        await executeExport(job);
        res.json({ success: true, message: 'Executed successfully' });
    } catch (error) {
        console.error('Manual execution failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. Execute Job Immediately (Without Saving)
app.post('/api/execute-immediate', async (req, res) => {
    const { url, outputDir, dateMode, actions, specificDate } = req.body;

    if (!url || !outputDir) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    console.log(`Manual trigger (immediate) for: ${url} (Date: ${dateMode} / ${specificDate})`);

    // Create a temporary job object compatible with executeExport
    const tempJob = {
        id: 'immediate-' + Date.now(),
        url,       // Custom URL from frontend
        outputDir, // Custom Output Dir
        dateMode: dateMode || 'today',
        specificDate: specificDate, // Only valid if dateMode is 'specific'
        actions: actions || { screen: true, note: true, notion: false }
    };

    try {
        await executeExport(tempJob);
        res.json({ success: true, message: 'Executed successfully' });
    } catch (error) {
        console.error('Immediate execution failed:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 6. Handle Login (Open Headful Browser)
app.post('/api/login', async (req, res) => {
    console.log('Opening browser for login...');
    try {
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ['--start-maximized'],
            userDataDir: USER_DATA_DIR
        });

        const targetUrl = req.body.url || 'https://taskchute.cloud/';

        const page = (await browser.pages())[0];
        await page.goto(targetUrl);

        await new Promise(resolve => {
            browser.on('disconnected', resolve);
        });

        console.log('Browser closed. Session saved.');
        res.json({ message: 'Login session saved.' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed: ' + error.message });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
