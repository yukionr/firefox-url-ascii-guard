'use strict';

(() => {
  // RFC 3986 unreserved and reserved characters, plus the percent escape marker.
  const forbidden = /[^A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]/u;
  const encodedNonAscii = /%[89a-f][0-9a-f]/i;

  function inspectUrl(value) {
    if (typeof value !== 'string' || !value) {
      return { warning: false, status: 'unavailable' };
    }
    // Search phrases and browser-internal schemes are outside the URL check.
    if (!/^(?:https?|ftps?|sftp|file|wss?):/i.test(value)) {
      return { warning: false, status: 'ignored' };
    }
    let url;
    try {
      url = new URL(value);
    } catch {
      return { warning: false, status: 'unavailable' };
    }
    const reasons = [];
    // Test the original string before URL parsing can normalize characters away.
    if (forbidden.test(value)) reasons.push('英数字・URL用記号以外の文字');
    // Firefox may expose internationalized hosts in their ASCII representation.
    if (url.hostname.split('.').some(label => /^xn--/i.test(label))) {
      reasons.push('国際化ドメイン（xn--）');
    }
    // Byte-level detection also handles malformed UTF-8 without decoding errors.
    if (encodedNonAscii.test(value)) reasons.push('符号化された非ASCII文字');
    return { warning: reasons.length > 0, status: reasons.length ? 'warning' : 'ascii', reasons };
  }

  globalThis.UrlAsciiGuard = { inspectUrl };
  if (typeof module !== 'undefined') module.exports = { inspectUrl };
})();
