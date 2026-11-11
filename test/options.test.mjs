import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validate, conversionArgs, encodeArgs } from '../src/options.mjs';
test('normalizes supported YouTube URLs and strips playlist parameters', () => {
  for (const url of [
    'https://youtu.be/BaW_jenozKc?list=abc',
    'https://www.youtube.com/watch?v=BaW_jenozKc&list=abc',
    'https://youtube.com/shorts/BaW_jenozKc',
  ])
    assert.equal(
      validate({ url, format: 'mp3', quality: '320' }).url,
      'https://www.youtube.com/watch?v=BaW_jenozKc',
    );
});
test('rejects unrelated hosts, playlists, credentials and injected quality', () => {
  for (const url of [
    'https://youtube.com.evil.test/watch?v=BaW_jenozKc',
    'http://youtube.com/watch?v=BaW_jenozKc',
    'https://youtube.com/playlist?list=abc',
    'https://user@youtube.com/watch?v=BaW_jenozKc',
    'file:///etc/passwd',
  ])
    assert.throws(() => validate({ url, format: 'mp3', quality: '320' }));
  assert.throws(() =>
    validate({ url: 'https://youtu.be/BaW_jenozKc', format: 'mp3', quality: '320; calc' }),
  );
});
test('SoundCloud accepts tracks and short links; rejects profiles, sets and mismatched tabs', () => {
  for (const url of [
    'https://soundcloud.com/forss/flickermood?si=123',
    'https://on.soundcloud.com/AbC123',
    'https://soundcloud.com/artist/track/s-secret',
  ])
    assert.equal(
      validate({ url, service: 'soundcloud', format: 'wav', quality: '24' }).service,
      'soundcloud',
    );
  for (const url of [
    'https://soundcloud.com/forss',
    'https://soundcloud.com/forss/sets/album',
    'https://soundcloud.com/forss/tracks',
    'https://soundcloud.com.evil.test/forss/flickermood',
  ])
    assert.throws(() => validate({ url, format: 'mp3', quality: '192' }));
  assert.throws(() =>
    validate({
      url: 'https://soundcloud.com/forss/flickermood',
      service: 'youtube',
      format: 'mp3',
      quality: '192',
    }),
  );
});
test('FFmpeg encodes every advertised format with selected quality', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'yoump3-'));
  try {
    for (const [format, qualities] of Object.entries({
      mp3: ['128', '320'],
      wav: ['16', '24'],
      flac: ['16', '24'],
      m4a: ['128', '256'],
      opus: ['96', '192'],
    })) {
      for (const quality of qualities) {
        const args = conversionArgs({ format, quality, url: 'https://youtu.be/BaW_jenozKc' }, dir);
        assert.equal(args.at(-2), '--');
        const output = path.join(dir, `${format}-${quality}.${format}`);
        const ff = encodeArgs({ format, quality }, 'sine=frequency=440:duration=0.2', output);
        ff.splice(ff.indexOf('-i'), 0, '-f', 'lavfi');
        ff.pop();
        execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [...ff, output], { windowsHide: true });
        assert.ok((await stat(output)).size > 100);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
