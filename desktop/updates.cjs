const { autoUpdater } = require('electron-updater');
module.exports = function (app, ipcMain, trusted, backend) {
  let state = {
      status: app.isPackaged ? 'idle' : 'development',
      version: app.getVersion(),
      message: app.isPackaged ? '' : 'Обновления доступны в установленном приложении.',
    },
    busy = false;
  const set = (status, data = {}) => (state = { ...state, status, ...data });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.channel = 'yoump3-v1';
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('checking-for-update', () =>
    set('checking', { message: 'Проверяем обновления…', percent: 0 }),
  );
  autoUpdater.on('update-available', (info) =>
    set('available', {
      next: info.version,
      message: 'Доступна версия ' + info.version + '. Скачать обновление?',
    }),
  );
  autoUpdater.on('download-progress', (p) =>
    set('downloading', { message: 'Скачиваем обновление…', percent: Math.round(p.percent) }),
  );
  autoUpdater.on('update-not-available', () =>
    set('current', { message: 'Установлена последняя версия.' }),
  );
  autoUpdater.on('update-downloaded', (info) =>
    set('ready', {
      next: info.version,
      percent: 100,
      message: 'Обновление скачано. Можно установить и перезапустить.',
    }),
  );
  autoUpdater.on('error', () =>
    set('error', { message: 'Обновление недоступно. Проверьте интернет и повторите попытку.' }),
  );
  async function check() {
    if (!app.isPackaged || busy || ['downloading', 'ready'].includes(state.status)) return;
    busy = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
    } finally {
      busy = false;
    }
  }
  ipcMain.handle('updates-state', (event) => {
    trusted(event);
    return state;
  });
  ipcMain.handle('updates-check', async (event) => {
    trusted(event);
    await check();
    return state;
  });
  ipcMain.handle('updates-download', async (event) => {
    trusted(event);
    if (state.status !== 'available' || busy) return state;
    busy = true;
    set('downloading', { message: 'Скачиваем обновление…', percent: 0 });
    try {
      await autoUpdater.downloadUpdate();
    } catch {
      set('available', { message: 'Скачать не удалось. Попробуйте ещё раз.' });
    } finally {
      busy = false;
    }
    return state;
  });
  ipcMain.handle('updates-install', (event) => {
    trusted(event);
    if (state.status !== 'ready') return { error: 'Сначала скачайте обновление.' };
    if (backend.isBusy()) return { error: 'Дождитесь завершения задач и анализа.' };
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  });
  const first = setTimeout(check, 1500);
  first.unref();
  const timer = setInterval(check, 7200000);
  timer.unref();
};
