const { app, BrowserWindow, shell, Tray, Menu } = require('electron');
const path = require('path');

// 0. Configuration
// Set the path where server.js should write data (db.json, puppeteer profile)
// In production, we cannot write to the app directory (asar).
process.env.USER_DATA_PATH = app.getPath('userData');

// 1. Start the Express Server
// Adjust path if necessary. We assume server.js is in the root.
require('./server.js');

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'public/tray_icon.png'), // Window icon (Linux/Win)
        webPreferences: {
            nodeIntegration: false, // Security: Keep true web context
            contextIsolation: true
        }
    });

    // 2. Load the Express App
    // The server in server.js listens on port 3000 by default.
    // We add a small delay or retry mechanic if needed, but usually server starts fast.
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 1000);

    // Handle external links (open in default browser, not Electron)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    // Override Close behavior to Minimize to Tray
    mainWindow.on('close', function (event) {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            if (process.platform === 'darwin') app.dock.hide(); // Hide from Dock
            return false;
        }
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'public/tray_icon.png');
    tray = new Tray(iconPath);
    tray.setToolTip('TaskChute Exporter');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'ウィンドウを表示', click: () => {
                mainWindow.show();
                if (process.platform === 'darwin') app.dock.show();
            }
        },
        { type: 'separator' },
        {
            label: '終了', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    // Click on Tray Icon toggles window
    tray.on('click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
            // if (process.platform === 'darwin') app.dock.hide(); 
            // Keep dock icon if you prefer standard behavior, but user wants "Background" feel.
            // Let's decide: hiding from dock is "cleaner" for resident apps.
        } else {
            mainWindow.show();
            if (process.platform === 'darwin') app.dock.show();
        }
    });
}

app.on('ready', () => {
    createWindow();
    createTray();
});

// Quit when all windows are closed? NO, keep running in tray.
app.on('window-all-closed', function () {
    // Do nothing, keep running
});

app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    } else {
        mainWindow.show();
    }
});

app.on('before-quit', () => {
    isQuitting = true;
});
