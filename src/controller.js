'use strict';

(() => {
  function attachWindow(win, inspectUrl, notify) {
    const urlbar = win.gURLBar;
    const browser = win.gBrowser;
    const attribute = 'data-url-ascii-guard-warning';
    let closed = false;

    function refresh(typing = false) {
      if (closed) return;
      const tab = browser.selectedBrowser;
      const edited = tab.userTypedValue !== null && tab.userTypedValue !== undefined;
      const value = typing || edited ? urlbar.value : tab.currentURI?.spec;
      const result = inspectUrl(value);
      if (result.warning) urlbar.setAttribute(attribute, 'true');
      else urlbar.removeAttribute(attribute);
      notify(result);
    }
    const input = () => win.queueMicrotask(() => refresh(true));
    const update = () => win.queueMicrotask(() => refresh());
    const progress = {
      onLocationChange(tab) {
        if (tab === browser.selectedBrowser) update();
      },
    };
    urlbar.inputField.addEventListener('input', input);
    urlbar.inputField.addEventListener('keyup', update);
    urlbar.inputField.addEventListener('blur', update);
    browser.tabContainer.addEventListener('TabSelect', update);
    browser.addTabsProgressListener(progress);
    refresh();

    return () => {
      closed = true;
      urlbar.inputField.removeEventListener('input', input);
      urlbar.inputField.removeEventListener('keyup', update);
      urlbar.inputField.removeEventListener('blur', update);
      browser.tabContainer.removeEventListener('TabSelect', update);
      browser.removeTabsProgressListener(progress);
      urlbar.removeAttribute(attribute);
    };
  }
  globalThis.UrlAsciiGuardController = { attachWindow };
  if (typeof module !== 'undefined') module.exports = { attachWindow };
})();
