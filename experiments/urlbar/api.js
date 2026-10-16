'use strict';

Cu.importGlobalProperties(['URL']);

this.urlbarGuard = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const windows = new Map();
    const pending = new Map();
    const subscribers = new Set();
    const root = context.extension.rootURI;
    const { PrivateBrowsingUtils } = ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
    const sheet = root.resolve('src/urlbar.css');
    let started = false;

    function detach(win) {
      if (pending.has(win)) {
        win.removeEventListener('load', pending.get(win));
        pending.delete(win);
      }
      const cleanup = windows.get(win);
      if (!cleanup) return;
      cleanup();
      try {
        win.windowUtils.removeSheetUsingURIString(sheet, win.windowUtils.USER_SHEET);
      } catch { /* A closing window may already have discarded its sheets. */ }
      windows.delete(win);
    }

    function attach(win) {
      if (windows.has(win) || win.document.documentElement.getAttribute('windowtype') !== 'navigator:browser') return;
      if (PrivateBrowsingUtils.isWindowPrivate(win) && !context.extension.privateBrowsingAllowed) return;
      win.windowUtils.loadSheetUsingURIString(sheet, win.windowUtils.USER_SHEET);
      const cleanup = UrlAsciiGuardController.attachWindow(win, UrlAsciiGuard.inspectUrl, result => {
        const state = {
          windowId: context.extension.windowManager.getWrapper(win).id,
          warning: result.warning, status: result.status, reasons: result.reasons || [],
        };
        for (const fire of subscribers) fire.async(state);
      });
      windows.set(win, cleanup);
    }

    const listener = {
      onOpenWindow(xulWindow) {
        const win = xulWindow.docShell.domWindow;
        const load = () => { pending.delete(win); attach(win); };
        pending.set(win, load);
        win.addEventListener('load', load, { once: true });
      },
      onCloseWindow(xulWindow) { detach(xulWindow.docShell.domWindow); },
    };

    this.cleanup = () => {
      if (started) Services.wm.removeListener(listener);
      started = false;
      for (const win of [...windows.keys(), ...pending.keys()]) detach(win);
      subscribers.clear();
    };
    context.callOnClose({ close: () => this.cleanup() });

    return {
      urlbarGuard: {
        async start() {
          if (started) return;
          started = true;
          Services.wm.addListener(listener);
          for (const win of Services.wm.getEnumerator('navigator:browser')) attach(win);
        },
        onStateChanged: new ExtensionCommon.EventManager({
          context, name: 'urlbarGuard.onStateChanged',
          register: fire => {
            subscribers.add(fire);
            return () => subscribers.delete(fire);
          },
        }).api(),
      },
    };
  }

  onShutdown(isAppShutdown) {
    if (!isAppShutdown) this.cleanup?.();
  }
};
