const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectUrl } = require('../src/guard.js');

test('ASCII letters, digits and RFC 3986 punctuation are allowed', () => {
  for (const url of [
    'https://example.test:8443/a-._~!$&\'()*+,;=:@?q=42#/test',
    'http://[::1]:8000/?x=%2F%20%25', 'about:blank',
    'https://example.test/?x=%2520ascii',
  ]) assert.equal(inspectUrl(url).warning, false, url);
});

test('non-ASCII characters in the hostname trigger a warning', () => {
  for (const url of ['https://еxample.test/', 'https://例え.test/', 'https://日本語.test/',
    'https://ｅxample.test/']) {
    assert.equal(inspectUrl(url).warning, true, url);
  }
});

test('serialized IDNs are detected without visiting or decoding the host', () => {
  for (const url of ['https://еxample.test/', 'https://例え.test/']) {
    assert.equal(inspectUrl(new URL(url).href).warning, true);
  }
  assert.equal(inspectUrl('https://XN--E1AFMKFD.test/').warning, true);
  assert.equal(inspectUrl('https://example.test/xn--test').warning, false);
});

test('paths, queries, fragments and credentials do not trigger a warning', () => {
  for (const url of ['https://example.test/記事', 'https://example.test/?q=é',
    'https://example.test/#а', 'https://example.test/\u200b',
    'https://ユーザー:秘密@example.test:8443/記事?q=日本語#見出し',
    'https://example.test/a b', 'https://example.test/\n',
    'file:///tmp/日本語.txt', 'https://[::1]:8000/記事']) {
    assert.equal(inspectUrl(url).warning, false, url);
  }
});

test('percent-encoded non-ASCII bytes are checked only in the hostname', () => {
  for (const suffix of ['%E6%97%A5', '%c3%a9', '%D0%B0', '%E2%80%AE', '%FF', '%80']) {
    assert.equal(inspectUrl(`https://example.test/${suffix}`).warning, false, suffix);
    assert.equal(inspectUrl(`https://example.test/?q=${suffix}#${suffix}`).warning, false, suffix);
    assert.equal(inspectUrl(`ftps://${suffix}.test/`).warning, true, suffix);
  }
  assert.equal(inspectUrl('https://%E6%97%A5.test/').warning, true);
  assert.equal(inspectUrl('https://example.test/%25E6%2597%25A5').warning, false);
});

test('unavailable URLs have a distinct state', () => {
  for (const value of [undefined, '']) {
    assert.equal(inspectUrl(value).status, 'unavailable');
  }
});

test('only explicit supported protocols are inspected; search text and internal URLs are ignored', () => {
  for (const value of ['日本語の検索', 'site:example.test 日本語', 'todo:買い物',
    '例え.test', 'example.test/記事', 'about:blank', 'data:text/html,日本語',
    'javascript:alert("日本語")', 'moz-extension://abc/日本語']) {
    const result = inspectUrl(value);
    assert.equal(result.warning, false, value);
    assert.equal(result.status, 'ignored', value);
  }
  for (const scheme of ['http', 'https', 'ftp', 'ftps', 'sftp', 'file', 'ws', 'wss', 'HTTPS']) {
    assert.equal(inspectUrl(`${scheme}://例え.test/`).warning, true, scheme);
    assert.equal(inspectUrl(`${scheme}://example.test/日本語`).warning, false, scheme);
  }
});
