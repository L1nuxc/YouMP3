import {
  readFile,
  writeFile,
  rename,
  copyFile,
  mkdir,
  readdir,
  stat,
  lstat,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const queues = new Map();
export const warnings = [];
export async function readJSON(file, fallback, valid = () => true) {
  for (const candidate of [file, file + '.bak'])
    try {
      const value = JSON.parse(await readFile(candidate, 'utf8'));
      if (!valid(value)) throw Error('Некорректная структура');
      if (candidate !== file) {
        warnings.push('Восстановлена копия ' + path.basename(file));
        await writeFile(file + '.recover', JSON.stringify(value));
        await rename(file + '.recover', file);
      }
      return value;
    } catch (e) {
      if (e.code !== 'ENOENT') {
        warnings.push('Ошибка чтения ' + path.basename(candidate));
        if (candidate === file)
          await copyFile(file, file + '.damaged-' + Date.now()).catch(() => {});
      }
    }
  return structuredClone(fallback);
}
export function atomicJSON(file, value) {
  const text = JSON.stringify(value);
  const task = (queues.get(file) || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      await writeFile(file + '.tmp', text);
      await copyFile(file, file + '.bak').catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
      await rename(file + '.tmp', file);
    });
  queues.set(file, task);
  return task;
}
export const validJob = (j) =>
  j &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(j.id) &&
  typeof j.title === 'string' &&
  ['mp3', 'wav', 'flac', 'm4a', 'opus', 'ogg'].includes(j.format) &&
  ['queued', 'info', 'downloading', 'converting', 'done', 'error', 'canceled'].includes(j.status) &&
  (!j.file || /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,160}\.(mp3|wav|flac|m4a|opus|ogg)$/.test(j.file));
export function jobDirectory(root, id) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))
    throw Error('Некорректный идентификатор');
  const dest = path.resolve(root, id);
  if (path.dirname(dest) !== path.resolve(root)) throw Error('Недопустимый путь');
  return dest;
}
async function regular(file) {
  const s = await lstat(file);
  if (!s.isFile() || s.isSymbolicLink()) throw Error('Ожидался обычный файл');
  return s;
}
async function directory(dir) {
  const s = await lstat(dir);
  if (!s.isDirectory() || s.isSymbolicLink())
    throw Error('Ссылки вместо папок библиотеки не поддерживаются.');
}
export async function backupLibrary(root, destination, jobs, games, preferences = {}) {
  const base = path.resolve(destination),
    source = path.resolve(root);
  if (base === source || base.startsWith(source + path.sep))
    throw Error('Выберите папку вне библиотеки.');
  const folder = path.join(
    base,
    'YouMP3-backup-' +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '-' +
      randomUUID().slice(0, 8),
  );
  await mkdir(folder, { recursive: true });
  const entries = [];
  for (const job of jobs.filter((j) => j.status === 'done' && !j.deletedAt)) {
    const dir = jobDirectory(root, job.id);
    await directory(dir);
    await regular(path.join(dir, job.file));
    const target = jobDirectory(folder, job.id);
    await mkdir(target);
    await copyFile(path.join(dir, job.file), path.join(target, job.file));
    if (job.cover) {
      await regular(path.join(dir, 'cover.jpg'));
      await copyFile(path.join(dir, 'cover.jpg'), path.join(target, 'cover.jpg'));
    }
    const { exported, settings, editing, pendingCover, ...safe } = job;
    entries.push(safe);
  }
  await atomicJSON(path.join(folder, 'backup.json'), {
    schema: 1,
    created: Date.now(),
    jobs: entries,
    games,
    preferences,
  });
  return folder;
}
export async function restoreLibrary(root, folder, existing) {
  const file = path.join(folder, 'backup.json');
  if ((await stat(file)).size > 32 * 1024 * 1024)
    throw Error('Слишком большой индекс резервной копии.');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  if (
    manifest.schema !== 1 ||
    !Array.isArray(manifest.jobs) ||
    manifest.jobs.length > 20000 ||
    !manifest.jobs.every((j) => validJob(j) && j.file && j.status === 'done')
  )
    throw Error('Некорректная резервная копия.');
  for (const j of manifest.jobs) {
    const dir = jobDirectory(folder, j.id);
    await directory(dir);
    await regular(path.join(dir, j.file));
    if (j.cover) await regular(path.join(dir, 'cover.jpg'));
  }
  const restored = [],
    moved = [],
    stage = path.join(root, '.restore-' + randomUUID());
  await mkdir(stage);
  try {
    for (const job of manifest.jobs) {
      if (existing.has(job.id)) continue;
      const dest = jobDirectory(root, job.id);
      try {
        await lstat(dest);
        continue;
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const target = jobDirectory(stage, job.id);
      await mkdir(target);
      await copyFile(path.join(folder, job.id, job.file), path.join(target, job.file));
      if (job.cover)
        await copyFile(path.join(folder, job.id, 'cover.jpg'), path.join(target, 'cover.jpg'));
      const { settings, exported, deletedAt, ...safe } = job;
      restored.push({ ...safe, status: 'done', editing: false, missing: false });
    }
    for (const j of restored) {
      await rename(jobDirectory(stage, j.id), jobDirectory(root, j.id));
      moved.push(j.id);
    }
  } catch (e) {
    for (const id of moved.reverse())
      await rename(jobDirectory(root, id), jobDirectory(stage, id)).catch(() => {});
    throw e;
  } finally {
    if (
      path.dirname(path.resolve(stage)) !== path.resolve(root) ||
      !path.basename(stage).startsWith('.restore-')
    )
      throw Error('Unexpected restore directory');
    await rm(stage, { recursive: true, force: true });
  }
  return { jobs: restored, games: manifest.games, preferences: manifest.preferences };
}
const disposable = (name, current) =>
  name !== current &&
  (/^(audio|edited-[a-f0-9-]+)\.(mp3|wav|flac|m4a|opus|ogg)$/.test(name) ||
    ['custom-image', 'pending-cover.jpg', 'thumbnail-image'].includes(name));
export async function storageReport(root, jobs) {
  let bytes = 0,
    unused = 0,
    missing = 0;
  for (const job of jobs) {
    const dir = jobDirectory(root, job.id);
    let entries = [];
    try {
      await directory(dir);
      entries = await readdir(dir, { withFileTypes: true });
    } catch {}
    let found = false;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const size = (await stat(path.join(dir, entry.name))).size;
      bytes += size;
      if (entry.name === job.file) found = true;
      if (disposable(entry.name, job.file)) unused += size;
    }
    job.missing = job.status === 'done' && !found;
    if (job.missing && !job.deletedAt) missing++;
  }
  return { bytes, unused, missing, deleted: jobs.filter((j) => j.deletedAt).length };
}
export async function cleanStorage(root, jobs, purge = false) {
  for (const job of jobs) {
    const dir = jobDirectory(root, job.id);
    try {
      await directory(dir);
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    if (purge && job.deletedAt) {
      await rm(dir, { recursive: true, force: true });
      continue;
    }
    for (const file of await readdir(dir))
      if (disposable(file, job.file)) {
        await regular(path.join(dir, file));
        await rm(path.join(dir, file), { force: true });
        if (file === 'pending-cover.jpg') job.pendingCover = false;
      }
  }
}
