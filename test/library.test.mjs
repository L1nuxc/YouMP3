import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const ffmpeg = path.resolve('tools/ffmpeg.exe');
test('import, analysis, file download and library survive server restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yoump3-library-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {
      env: { ...process.env, PORT: '0', YOUMP3_DOWNLOADS: dir, FFMPEG_PATH: ffmpeg },
      windowsHide: true,
    });
    child.stderr.on('data', (b) => process.stderr.write(b));
    return await new Promise((resolve, reject) => {
      child.stdout.on('data', (b) => {
        const m = b.toString().match(/127.0.0.1:(\d+)/);
        if (m) resolve('http://127.0.0.1:' + m[1]);
      });
      child.on('exit', () => reject(new Error('Server exited')));
    });
  }
  async function stop() {
    if (!child) return;
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill();
    });
    child = null;
  }
  try {
    const audio = path.join(dir, 'fixture.wav');
    execFileSync(
      ffmpeg,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'aevalsrc=0.07*(sin(2*PI*261.63*t)+sin(2*PI*329.63*t)+sin(2*PI*392*t))+0.5*sin(2*PI*90*t)*exp(-80*(t-floor(t/0.5)*0.5)):s=44100:d=20',
        audio,
      ],
      { windowsHide: true },
    );
    let origin = await start();
    let res = await fetch(origin + '/api/import?name=Test-C-major-120.wav', {
      method: 'POST',
      body: await readFile(audio),
    });
    assert.equal(res.status, 201);
    const { id } = await res.json();
    res = await fetch(origin + '/api/analyze/' + id, { method: 'POST' });
    assert.equal(res.status, 202);
    let job;
    for (let n = 0; n < 90; n++) {
      job = (await (await fetch(origin + '/api/jobs')).json()).find((j) => j.id === id);
      if (['done', 'error'].includes(job.analysisStatus)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    assert.equal(job.analysisStatus, 'done', job.analysisError);
    console.log('Synthetic 120 BPM / C major:', job.analysis);
    assert.ok(Math.abs(job.analysis.bpm - 120) < 5);
    assert.equal(job.analysis.key, 'C');
    assert.equal(job.analysis.scale, 'major');
    const bytes = await (await fetch(origin + '/api/files/' + id)).arrayBuffer();
    assert.equal(bytes.byteLength, (await readFile(audio)).length);
    let wave;
    for (let n = 0; n < 100; n++) {
      wave = await (await fetch(origin + '/api/wave/' + id)).json();
      if (wave.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(wave.status, 'done', wave.error);
    assert.equal(wave.peaks.length, 900);
    assert.ok(wave.peaks.some((v) => v > 0));
    assert.equal(wave.duration, 20);
    const gameSave = {
      schema: 2,
      updated: Date.now(),
      last: '2048',
      records: { 2048: 256 },
      states: { 2048: { board: [2, 4, 8, ...Array(13).fill(0)], score: 20 } },
    };
    assert.equal(
      (
        await fetch(origin + '/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gameSave),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(origin + '/api/correct/' + id, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bpm: 120, key: 'C', scale: 'major' }),
        })
      ).status,
      200,
    );
    await stop();
    origin = await start();
    const restored = (await (await fetch(origin + '/api/jobs')).json()).find((j) => j.id === id);
    assert.equal(restored.title, 'Test-C-major-120');
    assert.deepEqual(restored.analysis, job.analysis);
    assert.equal(restored.manualAnalysis.confirmed, true);
    assert.deepEqual(await (await fetch(origin + '/api/games')).json(), gameSave);
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
