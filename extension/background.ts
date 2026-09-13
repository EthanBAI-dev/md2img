import { PUBLISH_TARGETS, type PanelToBackground, type PlatformId } from '../src/shared/messages';

// 点扩展图标直接开侧边栏
chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    /* 老版本 Chrome 没有这个 API，退回 onClicked */
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

/** 找一个已经开着的发布页标签，没有就新建 */
async function ensureCreatorTab(platform: PlatformId): Promise<chrome.tabs.Tab> {
  const target = PUBLISH_TARGETS[platform];
  const existing = await chrome.tabs.query({ url: target.match });
  if (existing.length > 0 && existing[0].id !== undefined) {
    await chrome.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId !== undefined) {
      await chrome.windows.update(existing[0].windowId, { focused: true });
    }
    return existing[0];
  }
  return chrome.tabs.create({ url: target.url, active: true });
}

/** 等标签页加载完成，避免 content script 还没注入就发消息 */
function waitForTabReady(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);

    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // 页面是 SPA，DOM 还要再渲染一会儿
        setTimeout(resolve, 1200);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 400);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = raw as PanelToBackground | undefined;
  if (message?.type !== 'TEXTPIC_PUBLISH') return false;
  // 老版本侧边栏发来的消息没带平台，按小红书处理
  const platform: PlatformId = message.platform in PUBLISH_TARGETS ? message.platform : 'xiaohongshu';

  (async () => {
    try {
      const tab = await ensureCreatorTab(platform);
      if (tab.id === undefined) throw new Error('无法打开创作平台标签页');
      await waitForTabReady(tab.id);
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'TEXTPIC_FILL', platform });
      sendResponse(result);
    } catch (err) {
      sendResponse({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        steps: [],
      });
    }
  })();

  return true; // 保持消息通道开启以便异步回复
});
