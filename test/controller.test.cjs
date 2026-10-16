const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectUrl } = require('../src/guard.js');
const { attachWindow } = require('../src/controller.js');

function events() {
  const listeners = new Map();
  return {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type),
    emit: type => listeners.get(type)?.(),
    listeners,
  };
}

function setup() {
  const attrs = new Map();
  const input = events();
  const urlbar = {
    inputField: input, value: '',
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name),
  };
  const tabs = events();
  const browser = { userTypedValue: null, currentURI: { spec: 'https://example.test/記事' } };
  const gb = { selectedBrowser: browser, tabContainer: tabs,
    addTabsProgressListener: fn => { gb.progress = fn; },
    removeTabsProgressListener: () => { gb.progress = null; } };
  const states = [];
  const win = { gURLBar: urlbar, gBrowser: gb, queueMicrotask, ...events() };
  const detach = attachWindow(win, inspectUrl, state => states.push(state));
  return { win, input, attrs, browser, states, detach, urlbar, gb };
}

test('typing search text clears a loaded URL warning; explicit protocol URLs are checked', async () => {
  const { attrs, input, urlbar, states } = setup();
  assert.equal(attrs.has('data-url-ascii-guard-warning'), true);
  urlbar.value = '日本語の検索';
  input.emit('input');
  await Promise.resolve();
  assert.equal(attrs.has('data-url-ascii-guard-warning'), false);
  assert.equal(states.at(-1).status, 'ignored');
  urlbar.value = 'https://例え.test/';
  input.emit('input');
  await Promise.resolve();
  assert.equal(attrs.has('data-url-ascii-guard-warning'), true);
});

test('navigation, tab switching, Escape and cleanup restore correct state', async () => {
  const { attrs, browser, gb, win, input, detach, urlbar } = setup();
  browser.userTypedValue = '検索';
  urlbar.value = '検索';
  gb.tabContainer.emit('TabSelect');
  await Promise.resolve();
  assert.equal(attrs.size, 0);
  browser.userTypedValue = null;
  input.emit('keyup');
  await Promise.resolve();
  assert.equal(attrs.size, 1);
  browser.currentURI.spec = 'https://example.test/';
  gb.progress.onLocationChange(browser);
  await Promise.resolve();
  assert.equal(attrs.size, 0);
  browser.currentURI.spec = 'https://例え.test/';
  gb.progress.onLocationChange(browser);
  await Promise.resolve();
  assert.equal(attrs.size, 1);
  detach();
  assert.equal(attrs.size, 0);
  assert.equal(gb.progress, null);
  assert.equal(input.listeners.size, 0);
  assert.equal(win.listeners.size, 0);
});
