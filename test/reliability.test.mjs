import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
test('missing media cannot crash the server; trash, ETags and UI state survive port changes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yoump3-reliability-')),
    id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {
      env: { ...process.env, PORT: '0', YOUMP3_DOWNLOADS: dir },
      windowsHide: true,
    });
    return new Promise((resolve, reject) => {
      child.stdout.on('data', (b) => {
        const m = b.toString().match(/127\.0\.0\.1:(\d+)/);
        if (m) resolve('http://127.0.0.1:' + m[1]);
      });
      child.once('error', reject);
      child.once('exit', () => reject(Error('Server exited')));
    });
  }
  async function stop() {
    if (child) {
      await new Promise((r) => {
        child.once('exit', r);
        child.kill();
      });
      child = null;
    }
  }
  const post = (origin, url, value = {}) =>
    fetch(origin + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  try {
    await writeFile(
      path.join(dir, 'library.json'),
      JSON.stringify([{ id, title: 'Missing', file: 'audio.mp3', status: 'done', format: 'mp3' }]),
    );
    let origin = await start();
    assert.equal((await fetch(origin + '/api/files/' + id)).status, 404);
    assert.equal((await fetch(origin + '/api/jobs')).status, 200);
    assert.equal((await fetch(origin + '/api/games', { method: 'POST', body: '[]' })).status, 400);
    assert.equal(
      (
        await fetch(origin + '/api/games', {
          method: 'POST',
          headers: { Origin: 'https://example.com' },
          body: '{}',
        })
      ).status,
      403,
    );
    const response = await fetch(origin + '/api/jobs?compact=1');
    assert.ok(response.headers.get('etag'));
    assert.equal(
      (
        await fetch(origin + '/api/jobs?compact=1', {
          headers: { 'If-None-Match': response.headers.get('etag') },
        })
      ).status,
      304,
    );
    const prefs = { 'library-view': '"table"', collections: '{"Study":["' + id + '"]}' };
    assert.equal((await post(origin, '/api/preferences', prefs)).status, 200);
    assert.equal((await post(origin, '/api/trash/' + id)).status, 200);
    assert.equal((await (await fetch(origin + '/api/jobs')).json()).length, 0);
    await stop();
    origin = await start();
    assert.deepEqual(await (await fetch(origin + '/api/preferences')).json(), prefs);
    assert.equal((await (await fetch(origin + '/api/jobs')).json()).length, 0);
    assert.equal((await (await fetch(origin + '/api/jobs?trash=1')).json()).length, 1);
    assert.equal((await post(origin, '/api/restore/' + id)).status, 200);
    assert.equal((await (await fetch(origin + '/api/jobs')).json()).length, 1);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
