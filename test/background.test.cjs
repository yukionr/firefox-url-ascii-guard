const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('background consumes URL bar state and never calls theme APIs', async () => {
  const calls = [];
  let listener;
  const browser = {
    urlbarGuard: { onStateChanged: { addListener: fn => { listener = fn; } }, start: async () => calls.push('start') },
    tabs: { query: async () => [{ id: 11 }] },
    browserAction: {
      setBadgeText: async value => calls.push(value.text),
      setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {},
      setTitle: async value => calls.push(value.title),
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/background.js'), 'utf8'), { browser, console });
  await listener({ windowId: 1, warning: true, status: 'warning', reasons: ['国際化ドメイン'] });
  assert.ok(calls.includes('!'));
  await listener({ windowId: 1, warning: false, status: 'ignored', reasons: [] });
  assert.ok(calls.includes(''));
  assert.ok(calls.some(value => value.includes('判定対象外')));
});
