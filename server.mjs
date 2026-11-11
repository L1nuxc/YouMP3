import { validGameSave } from './public/game-models.js';
import { descriptionMusic } from './src/description-music.mjs';
import { correction } from './src/edits.mjs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import {
  atomicJSON,
  readJSON,
  validJob,
  warnings,
  backupLibrary,
  restoreLibrary,
  storageReport,
  cleanStorage,
} from './src/storage.mjs';
import { terminateProcess } from './src/process.mjs';
import {
  mkdir,
  readFile,
  stat,
  readdir,
  unlink,
  writeFile,
  rename,
  open,
  copyFile,
} from 'node:fs/promises';
import { safeName, rangeHeader } from './src/media.mjs';
import { searchOptions, startSearch } from './src/search.mjs';
import { waveform } from './src/waveform.mjs';
import { Worker } from 'node:worker_threads';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, conversionArgs, encodeArgs } from './src/options.mjs';
const root = path.dirname(fileURLToPath(import.meta.url)),
  downloads = process.env.YOUMP3_DOWNLOADS || path.join(root, 'downloads');
await mkdir(downloads, { recursive: true });
const ytdlp = process.env.YTDLP_PATH || path.join(root, 'tools', 'yt-dlp.exe');
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const settingsPath = path.join(downloads, 'settings.json');
export let settings = { metadata: true, cover: true, folder: process.env.YOUMP3_EXPORTS || '' };
Object.assign(
  settings,
  await readJSON(settingsPath, {}, (v) => v && typeof v === 'object' && !Array.isArray(v)),
);
export async function setFolder(folder) {
  settings.folder = folder;
  await atomicJSON(settingsPath, settings);
  return settings;
}
const children = new Set();
const searches = new Map();
let maintenanceTask = null;
const waves = new Map(),
  descriptions = new Map();
let gameState = await readJSON(
  path.join(downloads, 'games.json'),
  {},
  (v) => v && typeof v === 'object' && !Array.isArray(v),
);
let gameSaving = Promise.resolve();
const workers = new Set();
export function stopWorkers() {
  for (const child of children) terminateProcess(child);
  for (const worker of workers) worker.terminate();
}
let preferences = await readJSON(
  path.join(downloads, 'preferences.json'),
  {},
  (v) => v && typeof v === 'object' && !Array.isArray(v),
);
const indexPath = path.join(downloads, 'library.json');
let stored = await readJSON(indexPath, [], (v) => Array.isArray(v) && v.every(validJob));
const jobs = new Map(
  stored.map((j) => {
    if (!['done', 'error', 'canceled'].includes(j.status)) {
      j.status = 'queued';
      j.interrupted = true;
      delete j.error;
    }
    j.editing = false;
    if (j.analysisStatus === 'running') j.analysisStatus = 'idle';
    return [j.id, j];
  }),
);
let saving = Promise.resolve();
function persist() {
  saving = atomicJSON(indexPath, [...jobs.values()]);
  return saving;
}
for (const entry of await readdir(downloads, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^[-a-f0-9]{36}$/.test(entry.name) || jobs.has(entry.name)) continue;
  const files = await readdir(path.join(downloads, entry.name));
  const file = files.find((f) => /^audio\.(mp3|wav|flac|m4a|opus|ogg)$/.test(f));
  if (file) {
    const s = await stat(path.join(downloads, entry.name, file));
    jobs.set(entry.name, {
      id: entry.name,
      title: 'Ранее скачанное аудио',
      format: path.extname(file).slice(1),
      file,
      status: 'done',
      progress: 100,
      size: s.size,
      created: s.birthtimeMs,
      service: 'archive',
    });
  }
}
await persist();
let analyzing = false;
async function analyze(job) {
  analyzing = true;
  job.analysisStatus = 'running';
  delete job.analysisError;
  await persist();
  if (job.url && job.description === undefined) {
    try {
      const info = JSON.parse(
        await run(ytdlp, [
          '--ignore-config',
          '--skip-download',
          '--dump-single-json',
          '--no-playlist',
          '--socket-timeout',
          '12',
          '--js-runtimes',
          process.env.YOUMP3_NODE ? 'node:' + process.env.YOUMP3_NODE : 'node',
          '--',
          job.url,
        ]),
      );
      job.description = String(info.description || '').slice(0, 60000);
    } catch {
      job.descriptionWarning = 'Описание недоступно; используется локальный анализ.';
    }
  }
  job.descriptionAnalysis = descriptionMusic(job.description);
  const declared = job.descriptionAnalysis;
  const needs = { bpm: !declared.bpm, key: !declared.key };
  if (!needs.bpm && !needs.key) {
    job.analysisStatus = 'done';
    analyzing = false;
    await persist();
    return;
  }
  const worker = new Worker(new URL('./src/analyze.cjs', import.meta.url), {
    workerData: { ffmpeg, file: path.join(downloads, job.id, job.file), needs },
  });
  workers.add(worker);
  worker.once('exit', () => workers.delete(worker));
  const timeout = setTimeout(() => worker.terminate(), 180000);
  let received = false;
  worker.once('message', async (result) => {
    received = true;
    if (result.error) {
      job.analysisStatus = 'error';
      job.analysisError = result.error;
    } else {
      job.analysisStatus = 'done';
      job.analysis = result;
    }
    clearTimeout(timeout);
    analyzing = false;
    await persist();
  });
  worker.once('error', (error) => {
    job.analysisError = error.message;
  });
  worker.once('exit', async () => {
    clearTimeout(timeout);
    if (!received) {
      job.analysisStatus = 'error';
      job.analysisError ||= 'Анализ прерван.';
      analyzing = false;
      await persist();
    }
  });
}
const owned = new Map();
let working = false;
async function pump() {
  if (working) return;
  working = true;
  try {
    let job;
    while ((job = [...jobs.values()].find((j) => j.status === 'queued'))) await processJob(job);
  } finally {
    working = false;
  }
}
async function exportJob(job) {
  if (!job.settings?.folder) return;
  try {
    const name = safeName(
      job.artist ? job.artist + ' — ' + (job.track || job.title) : job.title,
      job.format,
    );
    let dest = path.join(job.settings.folder, name);
    try {
      await copyFile(path.join(downloads, job.id, job.file), dest, 1);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      dest = path.join(job.settings.folder, job.id.slice(0, 8) + ' — ' + name);
      await copyFile(path.join(downloads, job.id, job.file), dest, 1);
    }
    job.exported = dest;
  } catch (e) {
    job.exportError = 'Не удалось сохранить в папку: ' + e.message;
  }
}
async function fetchCover(url, dir) {
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    !['ytimg.com', 'sndcdn.com'].some(
      (domain) => u.hostname === domain || u.hostname.endsWith('.' + domain),
    )
  )
    throw new Error('Обложка недоступна.');
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Обложка недоступна.');
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) {
      await res.body.cancel().catch(() => {});
      throw new Error('Обложка слишком большая.');
    }
    chunks.push(chunk);
  }
  const file = path.join(dir, 'thumbnail-image');
  await writeFile(file, Buffer.concat(chunks));
  return file;
}
function run(command, args, onLine = () => {}, owner) {
  return new Promise((resolve, reject) => {
    if (owner?.status === 'canceled') return reject(new Error('Отменено'));
    const p = spawn(command, args, { windowsHide: true, shell: false });
    let out = '',
      err = '',
      pending = '';
    const timeout = setTimeout(
      () => {
        terminateProcess(p);
        reject(new Error('Превышено время ожидания. Повторите задачу.'));
      },
      owner ? 1800000 : 90000,
    );
    timeout.unref();
    p.once('close', () => clearTimeout(timeout));
    p.once('error', () => clearTimeout(timeout));
    children.add(p);
    p.on('close', () => children.delete(p));
    if (owner) {
      owned.set(owner.id, p);
      p.on('close', () => owned.delete(owner.id));
    }
    p.stdout.on('data', (b) => {
      out += b;
      if (out.length > 8 * 1024 * 1024) {
        terminateProcess(p);
        reject(new Error('Слишком большой ответ инструмента.'));
        return;
      }
      pending += b;
      let lines = pending.split(/[\r\n]+/);
      pending = lines.pop();
      lines.forEach(onLine);
    });
    p.stderr.on('data', (b) => {
      err = (err + b).slice(-8000);
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (pending) onLine(pending);
      if (owner?.status === 'canceled') return reject(new Error('Отменено'));
      code === 0 ? resolve(out) : reject(new Error(err || `Процесс завершился с кодом ${code}`));
    });
  });
}
async function processJob(job) {
  try {
    const dir = path.join(downloads, job.id);
    await mkdir(dir, { recursive: true });
    if (job.status === 'canceled') return;
    if (job.kind === 'trim') {
      const parent = jobs.get(job.parentId);
      if (!parent || parent.status !== 'done') throw new Error('Исходник недоступен.');
      job.status = 'converting';
      job.file = 'audio.' + job.format;
      if (parent.cover && job.settings.cover) {
        await copyFile(path.join(downloads, parent.id, 'cover.jpg'), path.join(dir, 'cover.jpg'));
        job.cover = true;
      }
      await run(
        ffmpeg,
        encodeArgs(
          { ...job, coverPath: job.cover ? path.join(dir, 'cover.jpg') : undefined },
          path.join(downloads, parent.id, parent.file),
          path.join(dir, job.file),
        ),
        () => {},
        job,
      );
      job.size = (await stat(path.join(dir, job.file))).size;
      job.progress = 100;
      if (job.status === 'canceled') return;
      await exportJob(job);
      if (job.status !== 'canceled') job.status = 'done';
      return;
    }
    job.status = 'info';
    const info = JSON.parse(
      await run(
        ytdlp,
        [
          '--ignore-config',
          '--js-runtimes',
          process.env.YOUMP3_NODE ? 'node:' + process.env.YOUMP3_NODE : 'node',
          '--no-playlist',
          '--socket-timeout',
          '30',
          '--skip-download',
          '--dump-single-json',
          '--',
          job.url,
        ],
        () => {},
        job,
      ),
    );
    if (info.entries || info._type === 'playlist')
      throw new Error('Вставьте ссылку на отдельный трек, а не плейлист.');
    if (info.extractor_key && !/^(Youtube|Soundcloud)$/i.test(info.extractor_key))
      throw new Error('Ссылка должна вести на видео YouTube или трек SoundCloud.');
    if (info.is_live) throw new Error('Дождитесь окончания прямой трансляции.');
    if (
      [...jobs.values()].some(
        (j) =>
          j.id !== job.id &&
          !j.deletedAt &&
          j.status === 'done' &&
          j.sourceId === info.id &&
          j.service === job.service,
      ) &&
      !job.force
    )
      throw new Error('Этот трек уже есть в библиотеке (распознана короткая ссылка).');
    job.description = String(info.description || '').slice(0, 60000);
    job.descriptionAnalysis = descriptionMusic(job.description);
    job.title = String(info.track || info.title || 'Без названия').slice(0, 500);
    job.track = job.title;
    job.artist = String(info.artist || info.creator || info.uploader || '').slice(0, 200);
    job.album = String(info.album || '').slice(0, 200);
    job.sourceId = info.id;
    job.duration = info.duration;
    job.status = 'downloading';
    await persist();
    await run(
      ytdlp,
      conversionArgs(job, dir),
      (line) => {
        const m = line.match(/download:\s*([\d.]+)%/);
        if (m) job.progress = Math.min(99, Number(m[1]));
        if (line.includes('[ExtractAudio]')) {
          job.status = 'converting';
          job.progress = 99;
        }
      },
      job,
    );
    const source = (await readdir(dir)).find((f) =>
      /^source\.(m4a|webm|ogg|mp4|mp3|wav|flac|opus|aac|mka)$/.test(f),
    );
    if (!source) throw new Error('Исходная аудиодорожка не найдена.');
    job.status = 'converting';
    job.progress = 99;
    job.file = 'audio.' + job.format;
    if (info.thumbnail && job.settings.cover) {
      try {
        const thumb = await fetchCover(info.thumbnail, dir);
        await run(
          ffmpeg,
          [
            '-nostdin',
            '-v',
            'error',
            '-y',
            '-i',
            thumb,
            '-frames:v',
            '1',
            '-vf',
            'scale=600:600:force_original_aspect_ratio=decrease',
            path.join(dir, 'cover.jpg'),
          ],
          () => {},
          job,
        );
        job.cover = true;
      } catch (e) {
        if (job.status === 'canceled') throw e;
        job.coverWarning = 'Обложка недоступна; аудио сохранено без неё.';
      }
    }
    await run(
      ffmpeg,
      encodeArgs(
        { ...job, coverPath: job.cover ? path.join(dir, 'cover.jpg') : undefined },
        path.join(dir, source),
        path.join(dir, job.file),
      ),
      () => {},
      job,
    );
    await unlink(path.join(dir, source));
    if (!job.file) throw new Error('Конвертация не создала файл.');
    job.size = (await stat(path.join(dir, job.file))).size;
    job.progress = 100;
    if (job.status === 'canceled') return;
    await exportJob(job);
    if (job.status !== 'canceled') job.status = 'done';
  } catch (e) {
    if (job.status !== 'canceled') {
      job.status = 'error';
      job.error = e.message.replaceAll(root, '[локальная папка]').slice(-2000);
    }
  } finally {
    await persist();
  }
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function bodyJSON(req, limit = 262144) {
  let size = 0,
    chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Слишком большой запрос'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const b = JSON.parse(Buffer.concat(chunks));
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error();
    return b;
  } catch {
    throw Object.assign(new Error('Ожидается объект JSON'), { status: 400 });
  }
}
export const server = http.createServer(async (req, res) => {
  try {
    if (!/^((127\.0\.0\.1|localhost):\d+)$/.test(req.headers.host || ''))
      return json(res, 403, { error: 'Только локальное подключение' });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`)
      return json(res, 403, { error: 'Недопустимый источник' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    const u = new URL(req.url, 'http://localhost');
    if (maintenanceTask && req.method === 'POST' && u.pathname !== '/api/search')
      return json(res, 409, { error: 'Дождитесь завершения резервного копирования.' });
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://w.soundcloud.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.ytimg.com https://*.sndcdn.com; media-src 'self' blob:; frame-src https://www.youtube-nocookie.com https://w.soundcloud.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    if (u.pathname === '/api/preferences') {
      if (req.method === 'GET') return json(res, 200, preferences);
      if (req.method !== 'POST') return json(res, 405, { error: 'Метод не поддерживается' });
      const b = await bodyJSON(req, 2 * 1024 * 1024);
      if (
        !Object.entries(b).every(
          ([k, v]) => /^[a-z-]{1,40}$/.test(k) && typeof v === 'string' && v.length <= 1024 * 1024,
        )
      )
        return json(res, 400, { error: 'Некорректные настройки интерфейса' });
      preferences = b;
      await atomicJSON(path.join(downloads, 'preferences.json'), preferences);
      return json(res, 200, { ok: true });
    }
    const libraryAction = u.pathname.match(/^\/api\/(trash|restore|retry)\/([a-f0-9-]+)$/);
    if (libraryAction && req.method === 'POST') {
      const j = jobs.get(libraryAction[2]);
      if (!j) return json(res, 404, { error: 'Трек не найден.' });
      if (
        j.editing ||
        j.analysisStatus === 'running' ||
        !['done', 'error', 'canceled'].includes(j.status)
      )
        return json(res, 409, { error: 'Дождитесь завершения операции.' });
      if (libraryAction[1] === 'trash') j.deletedAt = Date.now();
      else if (libraryAction[1] === 'restore') delete j.deletedAt;
      else {
        if (!j.url || !['error', 'canceled'].includes(j.status))
          return json(res, 400, { error: 'Повтор доступен для неудачной загрузки.' });
        j.status = 'queued';
        j.progress = 0;
        delete j.error;
      }
      await persist();
      pump();
      return json(res, 200, { ok: true });
    }
    if (u.pathname === '/api/storage' && req.method === 'GET')
      return json(res, 200, { ...(await storageReport(downloads, [...jobs.values()])), warnings });
    if (u.pathname === '/api/storage/clean' && req.method === 'POST') {
      if (isBusy()) return json(res, 409, { error: 'Дождитесь завершения задач.' });
      const b = await bodyJSON(req);
      await cleanStorage(downloads, [...jobs.values()], b.purge === true);
      if (b.purge === true) for (const [id, j] of jobs) if (j.deletedAt) jobs.delete(id);
      await persist();
      return json(res, 200, { ok: true });
    }
    const editRoute = u.pathname.match(/^\/api\/(correct|metadata|art)\/([a-f0-9-]+)$/);
    if (editRoute && req.method === 'POST') {
      const j = jobs.get(editRoute[2]);
      if (!j || j.status !== 'done') return json(res, 404, { error: 'Готовый трек не найден.' });
      if (j.editing || j.analysisStatus === 'running')
        return json(res, 409, { error: 'Дождитесь завершения текущей операции.' });
      if (editRoute[1] === 'correct') {
        try {
          const b = await bodyJSON(req);
          j.manualAnalysis = b.reset ? null : correction(b);
          await persist();
          return json(res, 200, { ok: true });
        } catch (e) {
          return json(res, 400, { error: e.message });
        }
      }
      const dir = path.join(downloads, j.id);
      if (editRoute[1] === 'art') {
        j.editing = true;
        const temp = path.join(dir, 'custom-image');
        try {
          const chunks = [];
          let size = 0;
          for await (const b of req) {
            size += b.length;
            if (size > 5 * 1024 * 1024) return json(res, 413, { error: 'Обложка до 5 МБ.' });
            chunks.push(b);
          }
          await writeFile(temp, Buffer.concat(chunks));
          await run(ffmpeg, [
            '-nostdin',
            '-v',
            'error',
            '-y',
            '-protocol_whitelist',
            'file,pipe',
            '-i',
            temp,
            '-frames:v',
            '1',
            '-vf',
            'scale=800:800:force_original_aspect_ratio=decrease',
            path.join(dir, 'pending-cover.jpg'),
          ]);
          j.pendingCover = true;
          return json(res, 200, { ok: true });
        } catch {
          return json(res, 400, { error: 'Не удалось прочитать изображение.' });
        } finally {
          j.editing = false;
          await unlink(temp).catch(() => {});
        }
      }
      const b = await bodyJSON(req);
      const title = String(b.title || '')
          .trim()
          .slice(0, 200),
        artist = String(b.artist || '')
          .trim()
          .slice(0, 160),
        album = String(b.album || '')
          .trim()
          .slice(0, 200);
      if (!title) return json(res, 400, { error: 'Укажите название.' });
      j.editing = true;
      try {
        const cover = b.removeCover
          ? null
          : j.pendingCover
            ? 'pending-cover.jpg'
            : j.cover
              ? 'cover.jpg'
              : null;
        const previousFile = j.file;
        const file = 'edited-' + randomUUID() + '.' + j.format;
        const options = {
          ...j,
          title,
          track: title,
          artist,
          album,
          trim: null,
          settings: { ...j.settings, metadata: true, cover: !!cover },
          quality: j.quality || (['wav', 'flac'].includes(j.format) ? '16' : '192'),
          coverPath: cover ? path.join(dir, cover) : null,
        };
        await run(ffmpeg, encodeArgs(options, path.join(dir, j.file), path.join(dir, file)));
        if (cover === 'pending-cover.jpg')
          await copyFile(path.join(dir, cover), path.join(dir, 'cover.jpg'));
        Object.assign(j, {
          title,
          track: title,
          artist,
          album,
          file,
          cover: !!cover,
          pendingCover: false,
          modified: Date.now(),
          size: (await stat(path.join(dir, file))).size,
        });
        await exportJob(j);
        j.editing = false;
        await persist();
        await unlink(path.join(dir, previousFile)).catch(() => {});
        await unlink(path.join(dir, 'pending-cover.jpg')).catch(() => {});
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 500, { error: e.message });
      } finally {
        j.editing = false;
      }
    }
    if (u.pathname === '/api/games') {
      if (req.method === 'POST') {
        const b = await bodyJSON(req);
        if (!validGameSave(b)) return json(res, 400, { error: 'Некорректное сохранение игры' });
        gameSaving = atomicJSON(path.join(downloads, 'games.json'), b);
        await gameSaving;
        gameState = b;
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET') return json(res, 200, gameState);
      return json(res, 405, { error: 'Метод не поддерживается' });
    }
    const waveMatch = u.pathname.match(/^\/api\/wave\/([a-f0-9-]+)$/);
    if (waveMatch && req.method === 'GET') {
      const j = jobs.get(waveMatch[1]);
      if (!j || j.status !== 'done') return json(res, 404, { error: 'Аудио недоступно.' });
      if (!waves.has(j.id)) {
        const state = { status: 'running' };
        waves.set(j.id, state);
        (async () => {
          try {
            const cache = path.join(downloads, j.id, 'wave.json');
            try {
              const data = JSON.parse(await readFile(cache, 'utf8'));
              Object.assign(state, { status: 'done', ...data });
              return;
            } catch {}
            if (!j.duration) {
              let text = '';
              try {
                await run(ffmpeg, ['-hide_banner', '-i', path.join(downloads, j.id, j.file)]);
              } catch (e) {
                text = e.message;
              }
              const m = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
              if (!m) throw new Error('Не удалось определить длительность.');
              j.duration = +m[1] * 3600 + +m[2] * 60 + +m[3];
              await persist();
            }
            const data = await waveform(
              ffmpeg,
              path.join(downloads, j.id, j.file),
              j.duration,
              children,
            );
            await writeFile(cache, JSON.stringify(data));
            Object.assign(state, { status: 'done', ...data });
          } catch (e) {
            Object.assign(state, { status: 'error', error: e.message });
          }
        })();
      }
      return json(res, 200, waves.get(j.id));
    }
    const detailsMatch = u.pathname.match(/^\/api\/description\/([\w-]{11})$/);
    if (detailsMatch && req.method === 'GET') {
      const id = detailsMatch[1];
      if (!descriptions.has(id)) {
        if (descriptions.size > 40) descriptions.delete(descriptions.keys().next().value);
        const state = { status: 'running' };
        descriptions.set(id, state);
        const task = startSearch(
          ytdlp,
          { service: 'youtube', query: id, page: 1, details: true },
          children,
        );
        task.promise.then(
          (data) => Object.assign(state, { status: 'done', ...data }),
          (e) => Object.assign(state, { status: 'error', error: e.message }),
        );
      }
      return json(res, 200, descriptions.get(id));
    }
    if (u.pathname === '/api/search' && req.method === 'POST') {
      let options;
      try {
        options = searchOptions(await bodyJSON(req));
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
      for (const [id, s] of searches)
        if (Date.now() - s.created > 300000) {
          s.cancel();
          searches.delete(id);
        }
      const cached = [...searches.values()].find(
        (s) => s.key === JSON.stringify(options) && s.status === 'done',
      );
      if (cached) return json(res, 200, { id: cached.id });
      if ([...searches.values()].filter((s) => s.status === 'running').length >= 2)
        return json(res, 429, { error: 'Дождитесь завершения поиска или отмените его.' });
      if (searches.size >= 30) {
        const old = [...searches.values()].find((s) => s.status !== 'running');
        if (old) searches.delete(old.id);
      }
      const task = startSearch(ytdlp, options, children),
        id = randomUUID(),
        s = {
          id,
          key: JSON.stringify(options),
          status: 'running',
          created: Date.now(),
          items: [],
          cancel: task.cancel,
        };
      searches.set(id, s);
      task.promise.then(
        (items) => {
          if (s.status === 'running') {
            s.items = items;
            s.status = 'done';
          }
        },
        (e) => {
          if (s.status === 'running') {
            s.status = 'error';
            s.error = e.message;
          }
        },
      );
      return json(res, 202, { id });
    }
    const searchMatch = u.pathname.match(/^\/api\/search\/([a-f0-9-]+)$/);
    if (searchMatch) {
      const s = searches.get(searchMatch[1]);
      if (!s) return json(res, 404, { error: 'Поиск устарел. Повторите запрос.' });
      if (req.method === 'DELETE') {
        s.status = 'canceled';
        s.cancel();
        return json(res, 200, { ok: true });
      }
      const { cancel, key, ...data } = s;
      return json(res, 200, data);
    }
    if (u.pathname === '/api/settings') {
      if (req.method === 'POST') {
        const b = await bodyJSON(req);
        if (typeof b.metadata === 'boolean') settings.metadata = b.metadata;
        if (typeof b.cover === 'boolean') settings.cover = b.cover;
        await atomicJSON(settingsPath, settings);
      }
      return json(res, 200, settings);
    }
    const action = u.pathname.match(/^\/api\/(cancel|edit|trim)\/([a-f0-9-]+)$/);
    if (action && req.method === 'POST') {
      const j = jobs.get(action[2]);
      if (!j) return json(res, 404, { error: 'Трек не найден' });
      if (action[1] === 'cancel') {
        if (['done', 'error', 'canceled'].includes(j.status))
          return json(res, 409, { error: 'Задача уже завершена' });
        j.status = 'canceled';
        terminateProcess(owned.get(j.id));
        await persist();
        return json(res, 200, { ok: true });
      }
      const b = await bodyJSON(req);
      if (action[1] === 'edit') {
        if (typeof b.favorite === 'boolean') j.favorite = b.favorite;
        if (Array.isArray(b.tags))
          j.tags = [
            ...new Set(
              b.tags
                .filter((t) => typeof t === 'string')
                .map((t) => t.trim().slice(0, 32))
                .filter(Boolean),
            ),
          ].slice(0, 15);
        await persist();
        return json(res, 200, { ok: true });
      }
      const start = Number(b.start),
        end = Number(b.end);
      if (
        j.status !== 'done' ||
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end - start > 21600 ||
        (j.duration && end > j.duration + 0.1)
      )
        return json(res, 400, { error: 'Укажите корректное начало и конец фрагмента.' });
      const job = {
        id: randomUUID(),
        parentId: j.id,
        kind: 'trim',
        trim: { start, end },
        fadeIn: Math.max(0, Math.min(10, (end - start) / 2, Number(b.fadeIn) || 0)),
        fadeOut: Math.max(0, Math.min(10, (end - start) / 2, Number(b.fadeOut) || 0)),
        title: j.title + ' (фрагмент)',
        artist: j.artist,
        track: (j.track || j.title) + ' (фрагмент)',
        album: j.album,
        format: j.format === 'ogg' ? 'mp3' : j.format,
        quality: j.quality || (['wav', 'flac'].includes(j.format) ? '16' : '192'),
        status: 'queued',
        created: Date.now(),
        progress: 0,
        service: j.service,
        tags: j.tags || [],
        settings: { ...settings },
        duration: end - start,
      };
      jobs.set(job.id, job);
      await persist();
      pump();
      return json(res, 202, { id: job.id });
    }
    if (u.pathname === '/api/import' && req.method === 'POST') {
      const name = u.searchParams.get('name') || 'audio.mp3',
        ext = path.extname(name).slice(1).toLowerCase();
      if (!['mp3', 'wav', 'flac', 'm4a', 'opus', 'ogg'].includes(ext))
        return json(res, 400, { error: 'Поддерживаются MP3, WAV, FLAC, M4A, Opus и OGG.' });
      const id = randomUUID(),
        dir = path.join(downloads, id);
      await mkdir(dir);
      const file = 'audio.' + ext;
      let size = 0;
      const handle = await open(path.join(dir, file), 'w');
      try {
        for await (const b of req) {
          size += b.length;
          if (size > 200 * 1024 * 1024) throw new Error('Лимит импорта — 200 МБ.');
          await handle.write(b);
        }
      } catch (e) {
        await handle.close();
        await unlink(path.join(dir, file));
        return json(res, 413, { error: e.message });
      }
      await handle.close();
      if (!size) {
        await unlink(path.join(dir, file));
        return json(res, 400, { error: 'Файл пуст.' });
      }
      let probe = '';
      try {
        await run(ffmpeg, ['-hide_banner', '-i', path.join(dir, file)]);
      } catch (e) {
        probe = e.message;
      }
      const duration = probe.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (!duration) {
        await unlink(path.join(dir, file));
        return json(res, 400, { error: 'Не удалось прочитать аудиофайл.' });
      }
      const tag = (key) =>
        probe.match(new RegExp('^\\s*' + key + '\\s*:\\s*(.+)$', 'im'))?.[1]?.trim();
      const title = tag('title') || path.basename(name).replace(/\.[^.]+$/, '');
      const job = {
        id,
        title,
        track: title,
        artist: tag('artist'),
        album: tag('album'),
        duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
        service: 'import',
        format: ext,
        file,
        status: 'done',
        progress: 100,
        size,
        created: Date.now(),
      };
      jobs.set(id, job);
      await persist();
      return json(res, 201, { id });
    }
    const am = u.pathname.match(/^\/api\/analyze\/([a-f0-9-]+)$/);
    if (am && req.method === 'POST') {
      const job = jobs.get(am[1]);
      if (!job || job.status !== 'done')
        return json(res, 404, { error: 'Готовый файл не найден.' });
      if (analyzing) return json(res, 409, { error: 'Дождитесь завершения анализа.' });
      analyze(job).catch(async (e) => {
        analyzing = false;
        job.analysisStatus = 'error';
        job.analysisError = e.message;
        await persist();
      });
      return json(res, 202, { ok: true });
    }
    if (u.pathname === '/api/health') {
      const checks = await Promise.allSettled([
        run(ytdlp, ['--version']),
        run(ffmpeg, ['-version']),
      ]);
      return json(res, 200, {
        ready: checks.every((x) => x.status === 'fulfilled'),
        ytdlp: checks[0].status === 'fulfilled',
        ffmpeg: checks[1].status === 'fulfilled',
      });
    }
    if (u.pathname === '/api/jobs' && req.method === 'GET') {
      await saving;
      const payload = [...jobs.values()]
        .filter((j) => (u.searchParams.has('trash') ? j.deletedAt : !j.deletedAt))
        .map(({ file, description, ...j }) =>
          u.searchParams.has('compact') ? j : { ...j, description },
        );
      const text = JSON.stringify(payload),
        tag = '"' + createHash('sha256').update(text).digest('hex') + '"';
      res.setHeader('ETag', tag);
      if (req.headers['if-none-match'] === tag) {
        res.writeHead(304);
        return res.end();
      }
      return json(res, 200, payload);
    }

    if (u.pathname === '/api/jobs' && req.method === 'POST') {
      if (!req.headers['content-type']?.startsWith('application/json'))
        return json(res, 415, { error: 'Ожидается JSON' });
      let body = '';
      for await (const b of req) {
        body += b;
        if (body.length > 4096) return json(res, 413, { error: 'Слишком большой запрос' });
      }
      let options;
      try {
        options = validate(JSON.parse(body));
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
      const input = JSON.parse(body);
      const duplicate = [...jobs.values()].find(
        (j) => j.url === options.url && !j.deletedAt && !['error', 'canceled'].includes(j.status),
      );
      if (duplicate && input.force !== true)
        return json(res, 409, {
          error: 'Эта ссылка уже в библиотеке или очереди.',
          duplicateId: duplicate.id,
        });
      const job = {
        ...options,
        id: randomUUID(),
        title: 'Ожидает загрузки',
        status: 'queued',
        progress: 0,
        created: Date.now(),
        force: input.force === true,
        settings: { ...settings },
      };
      jobs.set(job.id, job);
      await persist();
      pump();
      return json(res, 202, { id: job.id });
    }
    const media = u.pathname.match(/^\/api\/(stream|cover)\/([a-f0-9-]+)$/);
    if (media) {
      const j = jobs.get(media[2]);
      if (!j || j.deletedAt || j.status !== 'done')
        return json(res, 404, { error: 'Файл недоступен' });
      const cover = media[1] === 'cover';
      if (cover && !j.cover) return json(res, 404, { error: 'Нет обложки' });
      const file = path.join(downloads, j.id, cover ? 'cover.jpg' : j.file);
      let s;
      try {
        s = await stat(file);
      } catch {
        j.missing = !cover;
        return json(res, 404, { error: 'Файл отсутствует на диске.' });
      }
      let range;
      if (req.headers.range) {
        range = rangeHeader(req.headers.range, s.size);
        if (!range) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + s.size });
          return res.end();
        }
      }
      const mime = cover
        ? 'image/jpeg'
        : {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            m4a: 'audio/mp4',
            flac: 'audio/flac',
            opus: 'audio/ogg',
            ogg: 'audio/ogg',
          }[j.format] || 'application/octet-stream';
      res.writeHead(range ? 206 : 200, {
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Content-Length': range ? range.end - range.start + 1 : s.size,
        ...(range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${s.size}` } : {}),
      });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file, range || {});
      res.on('close', () => stream.destroy());
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
    const match = u.pathname.match(/^\/api\/files\/([a-f0-9-]+)$/);
    if (match && ['GET', 'HEAD'].includes(req.method)) {
      const j = jobs.get(match[1]);
      if (!j || j.deletedAt || j.status !== 'done')
        return json(res, 404, { error: 'Файл не найден' });
      const file = path.join(downloads, j.id, j.file);
      let info;
      try {
        info = await stat(file);
      } catch {
        return json(res, 404, {
          error: 'Файл отсутствует на диске. Восстановите копию или загрузите снова.',
        });
      }
      const name = safeName(j.artist ? j.artist + ' — ' + (j.track || j.title) : j.title, j.format),
        encoded = encodeURIComponent(name).replace(
          /[!'()*]/g,
          (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
        );
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': info.size,
        'Content-Disposition': `attachment; filename="audio.${j.format}"; filename*=UTF-8''${encoded}`,
      });
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      return stream.pipe(res);
    }
    const assets = {
      '/preferences.js': 'preferences.js',
      '/workspace.js': 'workspace.js',
      '/workspace.css': 'workspace.css',
      '/icons.js': 'icons.js',
      '/lucide.svg': 'lucide.svg',
      '/check.svg': 'check.svg',
      '/library-view.js': 'library-view.js',
      '/game-models.js': 'game-models.js',
      '/logo.svg': 'logo.svg',
      '/games.css': 'games.css',
      '/timeline.css': 'timeline.css',
      '/description-music.mjs': '../src/description-music.mjs',
      '/': 'index.html',
      '/style.css': 'style.css',
      '/app.js': 'app.js',
      '/games.js': 'games.js',
      '/games-rules.js': 'games-rules.js',
    };
    const asset = assets[u.pathname];
    if (!asset) return json(res, 404, { error: 'Не найдено' });
    res.setHeader(
      'Content-Type',
      asset.endsWith('svg')
        ? 'image/svg+xml'
        : asset.endsWith('css')
          ? 'text/css'
          : asset.endsWith('js') || asset.endsWith('mjs')
            ? 'text/javascript'
            : 'text/html; charset=utf-8',
    );
    res.end(await readFile(path.join(root, 'public', asset)));
  } catch (e) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    json(res, e.status || 500, {
      error: e.status
        ? e.message
        : 'Не удалось выполнить операцию. Проверьте файл и свободное место.',
    });
  }
});
export function isBusy() {
  return (
    !!maintenanceTask ||
    [...jobs.values()].some((j) => j.editing) ||
    analyzing ||
    [...jobs.values()].some((j) => !['done', 'error', 'canceled'].includes(j.status))
  );
}
export const listening = new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(
    process.env.PORT === undefined ? 3210 : Number(process.env.PORT),
    '127.0.0.1',
    () => {
      const port = server.address().port;
      console.log('YouMP3 → http://127.0.0.1:' + port);
      resolve(port);
      pump();
    },
  );
});
export function fileFor(id) {
  const j = jobs.get(id);
  if (!j || j.deletedAt || j.status !== 'done') throw Error('Файл не найден.');
  return path.join(downloads, j.id, j.file);
}
async function withMaintenance(operation) {
  if (isBusy()) throw Error('Дождитесь завершения задач.');
  const task = operation();
  maintenanceTask = task;
  try {
    return await task;
  } finally {
    if (maintenanceTask === task) maintenanceTask = null;
  }
}
export const waitForMaintenance = () => maintenanceTask?.catch(() => {});
export function backupTo(folder) {
  return withMaintenance(async () => {
    await saving;
    await gameSaving;
    return backupLibrary(
      downloads,
      folder,
      structuredClone([...jobs.values()]),
      gameState,
      preferences,
    );
  });
}
export function restoreFrom(folder) {
  return withMaintenance(async () => {
    await saving;
    await gameSaving;
    const result = await restoreLibrary(downloads, folder, jobs);
    for (const j of result.jobs) jobs.set(j.id, j);
    if (result.games && typeof result.games === 'object' && !Array.isArray(result.games)) {
      gameState = result.games;
      await atomicJSON(path.join(downloads, 'games.json'), gameState);
    }
    if (
      result.preferences &&
      typeof result.preferences === 'object' &&
      !Array.isArray(result.preferences)
    ) {
      preferences = result.preferences;
      await atomicJSON(path.join(downloads, 'preferences.json'), preferences);
    }
    await persist();
    return { count: result.jobs.length };
  });
}
export async function exportTo(ids, folder) {
  if (!Array.isArray(ids) || ids.length > 1000) throw Error('Выберите до 1000 треков.');
  let count = 0;
  for (const id of new Set(ids)) {
    const j = jobs.get(id);
    if (!j || j.deletedAt || j.status !== 'done') continue;
    const name = safeName(j.artist ? j.artist + ' — ' + (j.track || j.title) : j.title, j.format);
    let saved = false;
    for (let n = 0; n < 1000; n++) {
      const target = path.join(folder, n ? id.slice(0, 8) + '-' + n + ' — ' + name : name);
      try {
        await copyFile(fileFor(id), target, 1);
        saved = true;
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
    if (!saved) throw Error('Не удалось выбрать свободное имя файла.');
    count++;
  }
  return { count };
}
