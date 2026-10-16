'use strict';

browser.urlbarGuard.onStateChanged.addListener(async state => {
  try {
    const [tab] = await browser.tabs.query({ windowId: state.windowId, active: true });
    if (!tab) return;
    const title = state.warning
      ? `URL ASCII Guard — 注意: ${state.reasons.join('、')}。サイトの真正性を確認してください。`
      : state.status === 'ignored'
        ? 'URL ASCII Guard — 検索キーワードまたは対象外のプロトコル（判定対象外）'
        : state.status === 'unavailable'
          ? 'URL ASCII Guard — URLを取得できません（未判定）'
          : 'URL ASCII Guard — 対象文字の検出なし（安全性の保証ではありません）';
    await Promise.all([
      browser.browserAction.setBadgeText({ tabId: tab.id, text: state.warning ? '!' : state.status === 'unavailable' ? '?' : '' }),
      browser.browserAction.setBadgeBackgroundColor({ tabId: tab.id, color: '#b3261e' }),
      browser.browserAction.setBadgeTextColor({ tabId: tab.id, color: '#ffffff' }),
      browser.browserAction.setTitle({ tabId: tab.id, title }),
    ]);
  } catch {
    // Closing a tab/window may invalidate an in-flight badge update.
    console.warn('URL ASCII Guard: 状態表示を更新できませんでした。');
  }
});

browser.urlbarGuard.start().catch(() => {
  console.error('URL ASCII Guard: URLバーの監視を開始できませんでした。実験APIの設定を確認してください。');
});
