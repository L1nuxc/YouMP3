const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url'),
  { execFileSync } = require('node:child_process');
app.disableHardwareAcceleration();
require('node:fs').mkdirSync(path.resolve('build/ui-profile-v1'), { recursive: true });
app.setPath('userData', path.resolve('build/ui-profile-v1'));
app.on('window-all-closed', () => {});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  let backend,
    w,
    phase = 'setup';
  const logs = [];
  try {
    const root = path.resolve('build/ui-data-v1');
    await fs.mkdir(root, { recursive: true });
    const ffmpeg = path.resolve('tools/ffmpeg.exe'),
      jobs = [];
    for (let i = 0; i < 6; i++) {
      const id = '44444444-4444-4444-4444-' + String(i + 1).padStart(12, '0'),
        dir = path.join(root, id);
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'audio.mp3');
      execFileSync(
        ffmpeg,
        [
          '-v',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=' + (220 + i * 80) + ':duration=12',
          '-c:a',
          'libmp3lame',
          file,
        ],
        { windowsHide: true },
      );
      jobs.push({
        id,
        title: 'Тестовая запись ' + (i + 1),
        artist: 'Локальный файл',
        track: 'Тестовая запись ' + (i + 1),
        format: 'mp3',
        quality: '192',
        file: 'audio.mp3',
        size: (await fs.stat(file)).size,
        status: 'done',
        duration: 12,
        service: i % 2 ? 'soundcloud' : 'youtube',
        favorite: i === 0,
        created: 100 - i,
        descriptionAnalysis: { source: 'description', bpm: 120 + i * 5, key: 'C', scale: 'minor' },
        tags: i === 0 ? ['пример'] : [],
      });
    }
    await fs.writeFile(path.join(root, 'library.json'), JSON.stringify(jobs));
    await fs.writeFile(
      path.join(root, 'games.json'),
      JSON.stringify({
        schema: 2,
        records: { 'snake-normal': 100 },
        states: {
          2048: { board: [2, 2, 0, 0, ...Array(12).fill(0)], score: 0 },
          snake: {
            body: [
              [15, 7],
              [14, 7],
              [13, 7],
            ],
            dir: [1, 0],
            food: [1, 1],
            score: 0,
            speed: 'normal',
          },
        },
      }),
    );
    process.env.PORT = '0';
    process.env.YOUMP3_DOWNLOADS = root;
    process.env.FFMPEG_PATH = ffmpeg;
    process.env.YTDLP_PATH = path.resolve('tools/yt-dlp.exe');
    backend = await import(pathToFileURL(path.resolve('server.mjs')).href);
    const port = await backend.listening;
    w = new BrowserWindow({
      show: false,
      width: 1440,
      height: 960,
      frame: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
        offscreen: true,
      },
    });
    w.setContentSize(1440, 960);
    w.webContents.on('console-message', (event) => {
      if (event.level === 'error' && String(event.sourceId).includes('127.0.0.1'))
        logs.push(event.message);
    });
    w.webContents.on('render-process-gone', (_e, d) => logs.push('Renderer exited: ' + d.reason));
    w.webContents.session.webRequest.onBeforeRequest(
      { urls: ['*://*.youtube-nocookie.com/*', '*://w.soundcloud.com/*'] },
      (_d, callback) => callback({ cancel: true }),
    );
    await w.loadURL('http://127.0.0.1:' + port);
    const run = (fn) => w.webContents.executeJavaScript('(' + fn.toString() + ')()');
    phase = 'load';
    await run(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 160 && document.querySelector('#count').textContent !== '6'; i++)
        await wait(50);
      if (document.querySelector('#count').textContent !== '6')
        throw Error('Library failed to load');
      localStorage.setItem('intro-complete', 'true');
      document.querySelector('.intro-dialog')?.close();
    });
    phase = 'library';
    await run(async () => {
      const assert = (v, m) => {
          if (!v) throw Error(m);
        },
        wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-page=library]').click();
      await wait(200);
      assert(document.querySelectorAll('.track-tile').length === 6, 'six tracks');
      document.querySelector('.tile-title').click();
      assert(
        document.querySelector('#track-inspector').textContent.includes('Изменить данные'),
        'visible actions',
      );
      assert(!document.querySelector('.mini-wave'), 'small trim editor removed');
      assert(
        document.querySelector('.metric-source').textContent.includes('Из описания'),
        'analysis source',
      );
      document.querySelector('[aria-label="Исправить BPM / ключ"]').click();
      assert(document.querySelector('#correction-dialog').open, 'correction dialog');
      document.querySelector('#correct-close').click();
      [...document.querySelectorAll('.visible-track-actions button')]
        .find((b) => b.textContent === 'Изменить данные')
        .click();
      assert(document.querySelector('#metadata-dialog').open, 'metadata dialog');
      document.querySelector('#meta-close').click();
      document.querySelector('[aria-label=Список]').click();
      assert(document.querySelector('#jobs').classList.contains('view-list'), 'list view');
      document.querySelector('[aria-label=Таблица]').click();
      assert(document.querySelector('#jobs').classList.contains('view-table'), 'table view');
      document.querySelector('[aria-label=Обложки]').click();
      document.querySelector('.track-select').click();
      assert(!document.querySelector('.bulk-actions').hidden, 'bulk actions');
      document.querySelector('[aria-label="Снять выделение"]').click();
      document.querySelector('.tile-cover').click();
      await wait(300);
      assert(document.querySelector('#audio').src.includes('/api/stream/'), 'real audio');
      document.querySelector('#audio').pause();
      document.body.focus();
      const before = document.querySelector('#audio').currentTime;
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true }),
      );
      assert(document.querySelector('#audio').currentTime >= before + 4, 'seek hotkey');
      assert(
        getComputedStyle(document.querySelector('.tile-title')).outlineStyle === 'none',
        'no focus outline',
      );
    });
    await delay(200);
    await fs.writeFile(
      path.resolve('build/design-library.png'),
      (await w.webContents.capturePage()).toPNG(),
    );
    phase = 'dropdown';
    await run(async () => {
      document.querySelector('[data-page=download]').click();
      const select = document
        .querySelector('#quality')
        .parentElement.querySelector('.select-trigger');
      select.click();
      if (!document.querySelector('.select-popup')) throw Error('Custom dropdown missing');
      const option = document.querySelector('.select-option');
      option.click();
      document.querySelector('#url').value = 'https://soundcloud.com/example/track';
      document.querySelector('#url').dispatchEvent(new Event('input'));
      if (document.body.dataset.service !== 'soundcloud') throw Error('Source detection');
      document.querySelector('[data-service=youtube]').click();
      document.querySelector('[data-service=soundcloud]').click();
      if (!document.querySelector('#url').value.includes('soundcloud')) throw Error('Draft lost');
    });
    await delay(150);
    await fs.writeFile(
      path.resolve('build/design-download.png'),
      (await w.webContents.capturePage()).toPNG(),
    );
    phase = 'trim';
    await run(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-page=library]').click();
      document.querySelector('.tile-title').click();
      [...document.querySelectorAll('.visible-track-actions button')]
        .find((b) => b.textContent === 'Обрезать трек')
        .click();
      for (
        let n = 0;
        n < 80 && !document.querySelector('#trim-wave-status').textContent.includes('Тяните');
        n++
      )
        await wait(50);
      if (!document.querySelector('#trim-dialog').open || !document.querySelector('#trim-fade-in'))
        throw Error('Trim editor/fades missing');
      document.querySelector('[data-close=trim-dialog]').click();
    });
    phase = 'games';
    await run(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
        assert = (v, m) => {
          if (!v) throw Error(m);
        };
      document.querySelector('[data-page=games]').click();
      assert(document.querySelectorAll('.game-card').length === 4, 'exactly four games');
      document.querySelector('[data-game=studio]').click();
      const earn = document.querySelector('.studio-earn');
      earn.focus();
      const before = document.querySelector('.studio-scene b').textContent;
      earn.click();
      await wait(350);
      assert(earn === document.querySelector('.studio-earn'), 'stable clicker button');
      await wait(1100);
      const saved = await (await fetch('/api/games')).json();
      assert(saved.states.studio.coins >= 1, 'continuous clicker persistence');
      assert(document.querySelector('.studio-scene b').textContent !== before, 'click income');
      document.querySelector('#game-home').click();
      document.querySelector('[data-game="2048"]').click();
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft', bubbles: true }),
      );
      await wait(230);
      assert(document.querySelector('#game-status').textContent.includes('4'), '2048 merge');
      assert(document.querySelector('.number-tile.merged'), 'merge animation');
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true }),
      );
      assert(document.querySelectorAll('.number-tile').length === 2, '2048 undo');
    });
    await delay(200);
    await fs.writeFile(
      path.resolve('build/design-games.png'),
      (await w.webContents.capturePage()).toPNG(),
    );
    phase = 'snake-and-guess';
    await run(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
        assert = (v, m) => {
          if (!v) throw Error(m);
        };
      document.querySelector('#game-home').click();
      document.querySelector('[data-game=snake]').click();
      assert(document.querySelector('.snake-field canvas'), 'snake canvas');
      [...document.querySelectorAll('#game-controls button')]
        .find((b) => b.textContent === 'Начать')
        .click();
      document.querySelector('#game-pause').click();
      assert(!document.querySelector('#game-pause-message').hidden, 'snake pause');
      assert(document.querySelector('.snake-overlay').textContent.length > 0, 'snake instructions');
      document.querySelector('#game-pause').click();
      for (let n = 0; n < 120 && !document.querySelector('.game-result'); n++) await wait(50);
      assert(document.querySelector('.game-result'), 'snake collision result');
      await wait(1200);
      const saved = await (await fetch('/api/games')).json();
      assert(
        !saved.states.snake && saved.records['snake-normal'] === 100,
        'finished game saved without new record',
      );
      document.querySelector('#game-home').click();
      document.querySelector('[data-game=guess]').click();
      assert(document.querySelector('[aria-label="Громкость угадай трек"]'), 'guess volume');
      for (let n = 0; n < 100 && document.querySelector('.guess-listen').disabled; n++)
        await wait(50);
      assert(!document.querySelector('.guess-listen').disabled, 'guess audio ready');
      document.querySelector('.guess-listen').click();
      await wait(200);
      assert(
        [...document.querySelectorAll('.guess-choices button')].some((b) => !b.disabled),
        'answers after listening',
      );
      document.querySelector('.guess-choices button').click();
      assert(
        document.querySelector('.guess-feedback').textContent.length > 0,
        'round feedback persists',
      );
      document.querySelector('#game-home').click();
    });
    phase = 'delete';
    await run(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      document.querySelector('[data-page=library]').click();
      document.querySelector('.tile-title').click();
      [...document.querySelectorAll('.visible-track-actions button')]
        .find((b) => b.textContent === 'Удалить из библиотеки')
        .click();
      for (let n = 0; n < 100 && !document.querySelector('.undo-toast'); n++) await wait(50);
      if (document.querySelectorAll('.track-tile').length !== 5)
        throw Error('Trash did not remove track');
      document.querySelector('.undo-toast button').click();
      for (let n = 0; n < 100 && document.querySelectorAll('.track-tile').length !== 6; n++)
        await wait(50);
      if (document.querySelectorAll('.track-tile').length !== 6)
        throw Error('Undo did not restore');
    });
    phase = 'online-controls';
    await run(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)),
        assert = (v, m) => {
          if (!v) throw Error(m);
        };
      const originalFetch = window.fetch,
        events = {
          READY: 'ready',
          PLAY: 'play',
          PAUSE: 'pause',
          PLAY_PROGRESS: 'progress',
          ERROR: 'error',
          FINISH: 'finish',
        };
      const factory = () => {
        const handlers = {},
          w = {
            volume: 65,
            position: 0,
            bind: (name, fn) => {
              handlers[name] = fn;
              if (name === 'ready') setTimeout(fn, 20);
            },
            setVolume: (v) => (w.volume = v),
            getVolume: (fn) => fn(w.volume),
            getDuration: (fn) => fn(120000),
            getPosition: (fn) => fn(w.position),
            seekTo: (v) => (w.position = v),
            pause: () => handlers.pause?.(),
            play: () => handlers.play?.(),
            toggle: () => handlers.play?.(),
          };
        window.__qaWidget = w;
        return w;
      };
      factory.Events = events;
      window.SC = { Widget: factory };
      const items = [1, 2].map((i) => ({
        id: 'qa' + i,
        url: 'https://soundcloud.com/test-fixture/track-' + i,
        title: 'Тестовый результат ' + i,
        artist: 'Тест поиска',
        service: 'soundcloud',
        duration: 120,
        views: 0,
      }));
      window.fetch = async (url, options) =>
        url === '/api/search'
          ? new Response(JSON.stringify({ id: 'qa' }))
          : url === '/api/search/qa'
            ? new Response(JSON.stringify({ status: 'done', items }))
            : originalFetch(url, options);
      document.querySelector('[data-page=discover]').click();
      document.querySelector('[data-discover=soundcloud]').click();
      document.querySelector('#discover-query').value = 'test';
      document.querySelector('#discover-form').requestSubmit();
      for (let n = 0; n < 80 && document.querySelectorAll('.result-visual').length !== 2; n++)
        await wait(50);
      assert(document.querySelectorAll('.result-visual').length === 2, 'search result flow');
      document.querySelector('.result-visual').click();
      for (
        let n = 0;
        n < 80 &&
        (!document.querySelector('[aria-label="Громкость SoundCloud"]') ||
          document.querySelector('[aria-label="Громкость SoundCloud"]').disabled);
        n++
      )
        await wait(50);
      const volume = document.querySelector('[aria-label="Громкость SoundCloud"]');
      assert(volume && !volume.disabled, 'SoundCloud controls ready');
      volume.value = 0.27;
      volume.dispatchEvent(new Event('input'));
      assert(Math.abs(window.__qaWidget.volume - 27) < 0.1, 'widget volume');
      assert(
        document.querySelector('#player-favorite').disabled,
        'online favorite cannot edit a local track',
      );
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }),
      );
      assert(Math.abs(window.__qaWidget.volume - 32) < 0.1, 'online volume hotkey');
      document.querySelector('#seek').value = 10;
      document.querySelector('#seek').dispatchEvent(new Event('input'));
      assert(window.__qaWidget.position === 10000, 'online seek');
      document.querySelector('#online-close').click();
      assert(
        !document.querySelector('#player-title').textContent.includes('Тестовый результат'),
        'online close restores local player',
      );
      window.fetch = originalFetch;
      window.__qaDownloads = 0;
      let update = {
        status: 'available',
        version: '1.0.0',
        next: '1.0.1',
        message: 'Скачать обновление?',
      };
      window.desktop = {
        updateState: async () => update,
        checkUpdate: async () => update,
        downloadUpdate: async () => {
          window.__qaDownloads++;
          update = { ...update, status: 'ready', message: 'Готово к установке' };
          return update;
        },
        installUpdate: async () => ({ ok: true }),
      };
      for (let n = 0; n < 100 && document.querySelector('.update-notice').hidden; n++)
        await wait(50);
      assert(!document.querySelector('.update-notice').hidden, 'startup update notice');
      assert(window.__qaDownloads === 0, 'no automatic download');
      document.querySelector('.update-notice .primary').click();
      await wait(100);
      assert(window.__qaDownloads === 1, 'explicit update download');
      document.querySelector('.update-notice [aria-label="Позже"]').click();
    });
    phase = 'settings';
    await run(() => document.querySelector('[data-page=settings]').click());
    await delay(450);
    await fs.writeFile(
      path.resolve('build/design-settings.png'),
      (await w.webContents.capturePage()).toPNG(),
    );
    for (const width of [1000, 760]) {
      phase = 'width-' + width;
      w.setContentSize(width, 800);
      await run(() => document.querySelector('[data-page=library]').click());
      await delay(150);
      await run(() => {
        if (document.documentElement.scrollWidth > innerWidth) throw Error('Horizontal overflow');
      });
      await fs.writeFile(
        path.resolve('build/design-' + width + '.png'),
        (await w.webContents.capturePage()).toPNG(),
      );
    }
    if (logs.length) throw Error(logs.join('\n'));
    await fs.writeFile(
      path.resolve('build/designqa-result.json'),
      JSON.stringify(
        {
          ok: true,
          checks: [
            'library',
            'list/table',
            'bulk selection',
            'visible actions',
            'real audio',
            'hotkeys',
            'dropdowns',
            'source detection',
            'drafts',
            'trim/fades',
            'four games',
            'stable clicker and continuous saves',
            'SoundCloud volume and seeking (Widget API contract)',
            'update notice and explicit download',
            '2048 merge/undo',
            'snake pause',
            'guess audio/volume/feedback',
            'trash/undo',
            'responsive 1440/1000/760',
          ],
          logs,
        },
        null,
        2,
      ),
    );
    w.destroy();
    backend.stopWorkers();
    backend.server.close();
    app.exit(0);
  } catch (e) {
    await fs.writeFile(
      path.resolve('build/designqa-result.json'),
      JSON.stringify({ ok: false, phase, error: String(e.stack), logs }, null, 2),
    );
    w?.destroy();
    backend?.stopWorkers();
    backend?.server.close();
    app.exit(1);
  }
});
