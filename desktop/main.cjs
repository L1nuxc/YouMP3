const { app, BrowserWindow, dialog, session, ipcMain, clipboard, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let backend, window;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const tools = app.isPackaged
        ? path.join(process.resourcesPath, 'tools')
        : path.join(__dirname, '..', 'tools');
      process.env.YTDLP_PATH = path.join(tools, 'yt-dlp.exe');
      process.env.FFMPEG_PATH = path.join(tools, 'ffmpeg.exe');
      process.env.YOUMP3_NODE = path.join(tools, 'node.exe');
      process.env.YOUMP3_SEARCH_PLUGINS = app.isPackaged
        ? path.join(process.resourcesPath, 'search-plugins')
        : path.join(__dirname, '..', 'search-plugins');
      process.env.YOUMP3_DOWNLOADS = path.join(app.getPath('userData'), 'audio');
      process.env.YOUMP3_EXPORTS = app.getPath('downloads');
      process.env.PORT = '0';
      backend = await import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href);
      const port = await backend.listening,
        origin = `http://127.0.0.1:${port}`;
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSaveDialogOptions({
          defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
        });
      });
      window = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 760,
        minHeight: 640,
        title: 'YouMP3',
        backgroundColor: '#0b0b0b',
        icon: path.join(__dirname, 'icon.png'),
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#0d0d0d', symbolColor: '#b0b0b0', height: 44 },
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      const trusted = (event) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame.url.split('/').slice(0, 3).join('/') !== origin
        )
          throw new Error('Недопустимый источник');
      };
      require('./updates.cjs')(app, ipcMain, trusted, backend);
      ipcMain.handle('choose-folder', async (event) => {
        trusted(event);
        const result = await dialog.showOpenDialog(window, {
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: backend.settings.folder || app.getPath('downloads'),
        });
        if (!result.canceled) await backend.setFolder(result.filePaths[0]);
        return backend.settings;
      });
      ipcMain.handle('clipboard-read', (event) => {
        trusted(event);
        return clipboard.readText();
      });
      ipcMain.handle('clipboard-write', (event, text) => {
        trusted(event);
        clipboard.writeText(String(text).slice(0, 4096));
      });
      ipcMain.handle('show-file', (event, id) => {
        trusted(event);
        shell.showItemInFolder(backend.fileFor(String(id)));
      });
      ipcMain.handle('export-tracks', async (event, ids) => {
        trusted(event);
        if (!Array.isArray(ids) || ids.length > 1000) throw Error('Выберите до 1000 треков.');
        const r = await dialog.showOpenDialog(window, {
          title: 'Папка для экспорта треков',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (r.canceled) return null;
        return backend.exportTo(ids, r.filePaths[0]);
      });
      ipcMain.handle('backup-create', async (event) => {
        trusted(event);
        const r = await dialog.showOpenDialog(window, {
          title: 'Папка для резервной копии',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (r.canceled) return null;
        return { folder: await backend.backupTo(r.filePaths[0]) };
      });
      ipcMain.handle('backup-restore', async (event) => {
        trusted(event);
        const r = await dialog.showOpenDialog(window, {
          title: 'Папка YouMP3-backup с файлом backup.json',
          properties: ['openDirectory'],
        });
        if (r.canceled) return null;
        return backend.restoreFrom(r.filePaths[0]);
      });
      ipcMain.handle('open-source', async (event, value) => {
        trusted(event);
        const u = new URL(String(value));
        if (
          u.protocol !== 'https:' ||
          ![
            'www.youtube.com',
            'youtube.com',
            'soundcloud.com',
            'www.soundcloud.com',
            'on.soundcloud.com',
            'm.soundcloud.com',
            'youtu.be',
            'music.youtube.com',
            'm.youtube.com',
          ].includes(u.hostname) ||
          u.username ||
          u.password ||
          u.port
        )
          throw new Error('Недопустимая ссылка');
        await shell.openExternal(u.href);
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== origin) event.preventDefault();
      });
      let closing = false,
        closeRequested = false;
      window.on('close', async (event) => {
        if (closing) return;
        event.preventDefault();
        if (closeRequested) return;
        closeRequested = true;
        try {
          await backend.waitForMaintenance();
          await Promise.race([
            window.webContents.executeJavaScript(
              'Promise.all([window.yoump3FlushGames?.(),window.yoump3FlushPreferences?.()])',
            ),
            new Promise((resolve) => setTimeout(resolve, 2500)),
          ]);
        } catch {
        } finally {
          closing = true;
          window.close();
        }
      });
      await window.loadURL(origin);
    })
    .catch((error) => {
      dialog.showErrorBox('YouMP3', error.message);
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    backend?.stopWorkers();
    backend?.server.close();
  });
}
