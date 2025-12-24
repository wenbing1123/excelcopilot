const { app, BrowserWindow, shell } = require('electron');
});
  if (process.platform !== 'darwin') app.quit();
app.on('window-all-closed', () => {

});
  });
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  app.on('activate', () => {

  createWindow();
app.whenReady().then(() => {

}
  }
    win.loadFile(indexPath);
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
  } else {
    // 需要时可打开：win.webContents.openDevTools({ mode: 'detach' });
    win.loadURL(url);
    const url = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
  if (isDev) {

  });
    return { action: 'deny' };
    shell.openExternal(url);
  win.webContents.setWindowOpenHandler(({ url }) => {

  });
    },
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    webPreferences: {
    title: 'SheetNext 桌面端',
    minHeight: 640,
    minWidth: 980,
    height: 820,
    width: 1280,
  const win = new BrowserWindow({
function createWindow() {

const isDev = !app.isPackaged;

const path = require('path');

