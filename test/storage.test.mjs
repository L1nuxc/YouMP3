import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  atomicJSON,
  readJSON,
  backupLibrary,
  restoreLibrary,
  jobDirectory,
  storageReport,
  cleanStorage,
} from '../src/storage.mjs';
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
test('corrupt JSON recovers from backup and preserves diagnostic originals', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yoump3-json-'));
  try {
    const file = path.join(dir, 'data.json');
    await atomicJSON(file, { v: 1 });
    await atomicJSON(file, { v: 2 });
    await writeFile(file, '{broken');
    assert.deepEqual(await readJSON(file, {}), { v: 1 });
    assert.ok((await readdir(dir)).some((n) => n.includes('.damaged-')));
    await atomicJSON(file, { v: 3 });
    assert.deepEqual(JSON.parse(await readFile(file + '.bak', 'utf8')), { v: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('full backup restores bytes, tags, games and preferences without overwriting existing IDs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'yoump3-backup-'));
  try {
    const data = path.join(root, 'data'),
      destination = path.join(root, 'copies'),
      target = path.join(root, 'restored');
    await mkdir(path.join(data, id), { recursive: true });
    await mkdir(destination);
    await mkdir(target);
    await writeFile(path.join(data, id, 'audio.mp3'), 'audio bytes');
    const j = {
        id,
        title: 'Test',
        file: 'audio.mp3',
        format: 'mp3',
        status: 'done',
        tags: ['tag'],
      },
      games = { schema: 2, records: { studio: 100 } },
      preferences = { collections: '{"Test":["' + id + '"]}' };
    const folder = await backupLibrary(data, destination, [j], games, preferences);
    const result = await restoreLibrary(target, folder, new Map());
    assert.deepEqual(result.games, games);
    assert.deepEqual(result.preferences, preferences);
    assert.deepEqual(result.jobs[0].tags, ['tag']);
    assert.equal(await readFile(path.join(target, id, 'audio.mp3'), 'utf8'), 'audio bytes');
    assert.equal((await restoreLibrary(target, folder, new Map([[id, j]]))).jobs.length, 0);
    const manifest = JSON.parse(await readFile(path.join(folder, 'backup.json'), 'utf8'));
    manifest.jobs[0].file = '../secret.mp3';
    await writeFile(path.join(folder, 'backup.json'), JSON.stringify(manifest));
    await assert.rejects(restoreLibrary(target, folder, new Map()), /Некорректная/);
    assert.throws(() => jobDirectory(data, '../escape'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('storage cleanup preserves the current file and unrelated data', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'yoump3-clean-'));
  try {
    const dir = path.join(root, id);
    await mkdir(dir);
    const current = 'edited-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.mp3',
      old = 'edited-cccccccc-cccc-cccc-cccc-cccccccccccc.mp3';
    for (const name of [current, old, 'custom-image', 'keep.txt'])
      await writeFile(path.join(dir, name), 'data');
    const jobs = [{ id, title: 'Test', file: current, status: 'done' }];
    const report = await storageReport(root, jobs);
    assert.equal(report.missing, 0);
    assert.equal(report.unused, 8);
    await cleanStorage(root, jobs);
    assert.deepEqual((await readdir(dir)).sort(), [current, 'keep.txt'].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
