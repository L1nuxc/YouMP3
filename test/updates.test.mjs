import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
test('updates check without downloading, require an explicit action and protect installation', async () => {
  const updater = new EventEmitter(),
    handlers = {},
    timers = [];
  let checks = 0,
    downloads = 0,
    installs = 0,
    busy = false;
  updater.checkForUpdates = async () => {
    checks++;
    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '1.0.1' });
  };
  updater.downloadUpdate = async () => {
    downloads++;
    updater.emit('download-progress', { percent: 50 });
    updater.emit('update-downloaded', { version: '1.0.1' });
  };
  updater.quitAndInstall = () => installs++;
  const sandbox = {
    module: { exports: {} },
    require: () => ({ autoUpdater: updater }),
    setTimeout: (fn) => {
      timers.push(fn);
      return { unref() {} };
    },
    setInterval: () => ({ unref() {} }),
    setImmediate: (fn) => fn(),
  };
  vm.runInNewContext(
    await readFile(new URL('../desktop/updates.cjs', import.meta.url), 'utf8'),
    sandbox,
  );
  sandbox.module.exports(
    { isPackaged: true, getVersion: () => '1.0.0' },
    { handle: (name, fn) => (handlers[name] = fn) },
    () => {},
    { isBusy: () => busy },
  );
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.channel, 'yoump3-v1');
  await handlers['updates-download']({});
  assert.equal(downloads, 0);
  await timers[0]();
  assert.equal(checks, 1);
  assert.equal(downloads, 0);
  assert.equal(handlers['updates-state']({}).status, 'available');
  await handlers['updates-download']({});
  assert.equal(downloads, 1);
  assert.equal(handlers['updates-state']({}).status, 'ready');
  busy = true;
  assert.ok(handlers['updates-install']({}).error);
  assert.equal(installs, 0);
  busy = false;
  assert.equal(handlers['updates-install']({}).ok, true);
  assert.equal(installs, 1);
});
