import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionMusic, resolvedMusic } from '../src/description-music.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
test('explicit producer declarations in English, Russian and compact notation', () => {
  for (const [text, bpm, key, scale] of [
    ['BPM: 140\nKey: F# minor', 140, 'F#', 'minor'],
    ['145 BPM | F#m', 145, 'F#', 'minor'],
    ['Темп: 92,5\nТональность: фа диез минор', 92.5, 'F#', 'minor'],
    ['Tempo - 128\nKEY = D♭ MAJOR', 128, 'C#', 'major'],
    ['BPM 130\nKey: Am', 130, 'A', 'minor'],
    ['BPM: 140\n140 BPM\nKey: D# minor\nEb minor', 140, 'Eb', 'minor'],
  ]) {
    const r = descriptionMusic(text);
    assert.equal(r.bpm, bpm, text);
    assert.equal(r.key, key, text);
    assert.equal(r.scale, scale, text);
  }
});
test('ambiguous and irrelevant descriptions never invent a value or mode', () => {
  for (const text of [
    'I am a producer. DM me!',
    'Buy beat for $140 in 2026',
    'BPM: 1400',
    '1200 BPM',
    'BPM: 10',
    'BPM: 140.555',
    'key: giveaway',
  ]) {
    const r = descriptionMusic(text);
    assert.equal(r.bpm, undefined, text);
    assert.equal(r.key, undefined, text);
  }
  const conflict = descriptionMusic('BPM: 70 / 140 BPM\nKey: C minor\nKey: D minor');
  assert.deepEqual(conflict.conflicts, ['bpm', 'key']);
  assert.equal(conflict.bpm, undefined);
  assert.equal(conflict.key, undefined);
  const noMode = descriptionMusic('BPM: 150\nKey: F#');
  assert.equal(noMode.key, 'F#');
  assert.equal(noMode.scale, undefined);
  const r = resolvedMusic({
    descriptionAnalysis: noMode,
    analysis: { bpm: 75, key: 'C', scale: 'major' },
  });
  assert.equal(r.bpm, 150);
  assert.equal(r.key, 'F#');
  assert.equal(r.scale, undefined);
  assert.equal(r.keySource, 'description');
});
test('manual values override declarations; missing fields fall back separately', () => {
  const descriptionAnalysis = descriptionMusic('BPM: 145');
  let r = resolvedMusic({ descriptionAnalysis, analysis: { bpm: 72.5, key: 'A', scale: 'minor' } });
  assert.equal(r.bpm, 145);
  assert.equal(r.bpmSource, 'description');
  assert.equal(r.key, 'A');
  assert.equal(r.keySource, 'algorithm');
  r = resolvedMusic({
    descriptionAnalysis,
    manualAnalysis: { bpm: 144, key: 'B', scale: 'major' },
    analysis: { bpm: 72.5, key: 'A', scale: 'minor' },
  });
  assert.equal(r.bpm, 144);
  assert.equal(r.key, 'B');
  assert.equal(r.keySource, 'manual');
});
test('description skips audio analyzer and persists across restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yoump3-description-'));
  let child;
  const id = '22222222-2222-2222-2222-222222222222';
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], {
      env: {
        ...process.env,
        PORT: '0',
        YOUMP3_DOWNLOADS: dir,
        FFMPEG_PATH: 'nonexistent-ffmpeg.exe',
      },
      windowsHide: true,
    });
    return new Promise((resolve, reject) => {
      child.stdout.on('data', (b) => {
        const m = b.toString().match(/127.0.0.1:(\d+)/);
        if (m) resolve('http://127.0.0.1:' + m[1]);
      });
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
  try {
    await writeFile(
      path.join(dir, 'library.json'),
      JSON.stringify([
        {
          id,
          status: 'done',
          title: 'Beat',
          service: 'youtube',
          format: 'mp3',
          file: 'missing.mp3',
          description: 'BPM: 150\nKey: F# minor',
        },
      ]),
    );
    let origin = await start();
    assert.equal((await fetch(origin + '/api/analyze/' + id, { method: 'POST' })).status, 202);
    let job;
    for (let n = 0; n < 40; n++) {
      job = (await (await fetch(origin + '/api/jobs')).json())[0];
      if (job.analysisStatus !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(job.analysisStatus, 'done');
    assert.equal(job.descriptionAnalysis.bpm, 150);
    assert.equal(job.descriptionAnalysis.key, 'F#');
    assert.equal(job.analysis, undefined);
    await stop();
    origin = await start();
    job = (await (await fetch(origin + '/api/jobs')).json())[0];
    assert.equal(job.descriptionAnalysis.scale, 'minor');
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
