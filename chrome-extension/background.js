/**
 * Gemini Chat Scraper - Background Script
 * 简化的状态管理
 */

console.log('[GeminiScraper] Background script加载中...');

let scrapeState = {
  isScraping: false,
  currentTabId: null
};

chrome.runtime.onInstalled.addListener(() => {
  console.log('[GeminiScraper] 扩展已安装');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[GeminiScraper] 收到消息:', request.type || request.action);

  switch (request.action) {
    case 'startScraping':
      scrapeState.isScraping = true;
      scrapeState.currentTabId = sender.tab?.id;
      sendResponse({ success: true, message: '开始抓取' });
      break;

    case 'stopScraping':
      scrapeState.isScraping = false;
      sendResponse({ success: true, message: '停止抓取' });
      break;

    case 'ping':
      sendResponse({ success: true, message: 'Background已就绪', isScraping: scrapeState.isScraping });
      break;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (scrapeState.currentTabId === tabId) {
    scrapeState.isScraping = false;
    scrapeState.currentTabId = null;
  }
});

console.log('[GeminiScraper] Background script已加载');
