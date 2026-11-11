const { parentPort, workerData } = require('node:worker_threads');
const { spawnSync } = require('node:child_process');
try {
  const decoded = spawnSync(
    workerData.ffmpeg,
    [
      '-nostdin',
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-i',
      workerData.file,
      '-t',
      '180',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-f',
      'f32le',
      'pipe:1',
    ],
    { windowsHide: true, timeout: 90000, maxBuffer: 40 * 1024 * 1024 },
  );
  if (decoded.status !== 0) throw new Error('Не удалось прочитать аудио.');
  const b = decoded.stdout,
    signal = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  if (signal.length < 44100 * 5) throw new Error('Для анализа нужно хотя бы 5 секунд аудио.');
  let energy = 0;
  for (const s of signal) energy += s * s;
  if (energy / signal.length < 1e-9) throw new Error('В файле тишина.');
  const Essentia = require('essentia.js/dist/essentia.js-core.umd.js'),
    wasm = require('essentia.js/dist/essentia-wasm.umd.js');
  const e = new Essentia(wasm),
    v = e.arrayToVector(signal),
    needs = workerData.needs || { bpm: true, key: true },
    rhythm = needs.bpm ? e.RhythmExtractor2013(v, 208, 'multifeature', 40) : null,
    key = needs.key ? e.KeyExtractor(v) : null;
  parentPort.postMessage({
    ...(rhythm ? { bpm: Math.round(rhythm.bpm * 10) / 10, bpmConfidence: rhythm.confidence } : {}),
    ...(key ? { key: key.key, scale: key.scale, strength: key.strength } : {}),
    seconds: Math.round(signal.length / 44100),
    algorithm: 'Essentia',
  });
  v.delete();
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
