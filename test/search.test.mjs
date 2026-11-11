import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchOptions, searchArgs, normalizeResults } from '../src/search.mjs';
test('search query validation and safe bounded pagination', () => {
  for (const input of [
    { service: 'spotify', query: 'beat' },
    { service: 'youtube', query: 'x' },
    { service: 'youtube', query: 'beat', page: 4 },
    { service: 'soundcloud', query: 'x\nxx' },
  ])
    assert.throws(() => searchOptions(input));
  const opts = searchOptions({ service: 'youtube', query: '  Tevek type beat  ', page: 2 });
  assert.equal(opts.query, 'Tevek type beat');
  const args = searchArgs(opts);
  assert.equal(args.at(-2), '--');
  assert.equal(args.at(-1), 'ytsearch20:Tevek type beat');
  assert.equal(args[args.indexOf('--playlist-start') + 1], '11');
});
test('normalize only supported single tracks; discard hostile media URLs and duplicates', () => {
  const yt = normalizeResults(
    {
      entries: [
        { id: 'jNQXAC9IVRw', title: 'A', thumbnails: [{ url: 'https://evil.test/a.jpg' }] },
        { id: 'jNQXAC9IVRw' },
        { id: 'not-video' },
      ],
    },
    'youtube',
  );
  assert.equal(yt.length, 1);
  assert.equal(yt[0].thumbnail, null);
  const sc = normalizeResults(
    {
      entries: [
        {
          id: '1',
          title: 'track',
          url: 'https://api.soundcloud.com/tracks/1',
          webpage_url: 'https://soundcloud.com/forss/flickermood',
          thumbnails: [{ url: 'https://i1.sndcdn.com/cover.jpg' }],
        },
        { id: '2', url: 'https://soundcloud.com/forss/sets/album' },
        { id: '3', url: 'https://evil.test/artist/track' },
      ],
    },
    'soundcloud',
  );
  assert.equal(sc.length, 1);
  assert.equal(sc[0].url, 'https://soundcloud.com/forss/flickermood');
  assert.equal(sc[0].thumbnail, 'https://i1.sndcdn.com/cover.jpg');
});
