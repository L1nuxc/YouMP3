// The desktop server uses a random port. A backend copy keeps UI state stable
// across launches; localStorage remains a synchronous mirror for UI modules.
const keys = new Set([
  'workspace-state',
  'page-scrolls',
  'discover-cache',
  'quality-memory',
  'library-view',
  'collections',
  'play-queue',
  'repeat',
  'shuffle',
  'track-positions',
  'last-track',
  'volume',
  'panel-width',
  'panel-collapsed',
  'intro-complete',
  'seek-step',
  'online-volume',
  'online-before-mute',
  'guess-volume',
  'game-effects',
  'discover-service',
  'download-format',
  'discover-format',
]);
const original = Storage.prototype.setItem;
let snapshot = {},
  timer,
  chain = Promise.resolve(),
  loaded = false,
  warned = false;
async function remotePreferences() {
  const response = await fetch('/api/preferences');
  if (!response.ok) throw Error('Preferences unavailable');
  const value = await response.json();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid preferences');
  return value;
}
function mirror(values) {
  for (const [key, value] of Object.entries(values))
    if (keys.has(key) && typeof value === 'string') original.call(localStorage, key, value);
}
window.yoump3ReloadPreferences = async () => {
  snapshot = await remotePreferences();
  mirror(snapshot);
  loaded = true;
};
try {
  await window.yoump3ReloadPreferences();
} catch {}
function flush() {
  clearTimeout(timer);
  const pending = { ...snapshot };
  chain = chain
    .catch(() => {})
    .then(async () => {
      if (!loaded) {
        const remote = await remotePreferences();
        snapshot = { ...remote, ...pending };
        mirror(snapshot);
        loaded = true;
      }
      const body = JSON.stringify(snapshot);
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!response.ok) throw Error('Preferences not saved');
      warned = false;
    })
    .catch(() => {
      if (!warned) {
        warned = true;
        window.dispatchEvent(new Event('yoump3-preferences-error'));
      }
      timer = setTimeout(flush, 5000);
    });
  return chain;
}
Storage.prototype.setItem = function (key, value) {
  original.call(this, key, value);
  if (this === localStorage && keys.has(key) && snapshot[key] !== String(value)) {
    snapshot[key] = String(value);
    clearTimeout(timer);
    timer = setTimeout(flush, 350);
  }
};
window.yoump3FlushPreferences = flush;
window.addEventListener('pagehide', () => {
  if (loaded)
    navigator.sendBeacon(
      '/api/preferences',
      new Blob([JSON.stringify(snapshot)], { type: 'application/json' }),
    );
});
