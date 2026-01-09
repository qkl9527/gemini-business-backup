/**
 * Gemini Chat Scraper - Background Script
 * 最小化版本
 */

console.log('[GeminiScraper] Background script加载中...');

// 存储抓取状态
let scrapeState = {
  isScraping: false,
  currentTabId: null,
  currentChatIndex: 0,
  totalChats: 0,
  scrapedChats: []
};

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[GeminiScraper] 扩展已安装');
  scrapeState = {
    isScraping: false,
    currentTabId: null,
    currentChatIndex: 0,
    totalChats: 0,
    scrapedChats: []
  };
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[GeminiScraper] 收到消息:', request.action);

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

    case 'updateState':
      scrapeState = { ...scrapeState, ...request.state };
      sendResponse({ success: true });
      break;

    case 'getState':
      sendResponse({ success: true, state: scrapeState });
      break;

    case 'ping':
      sendResponse({ success: true, message: 'Background已就绪', isScraping: scrapeState.isScraping });
      break;

    default:
      sendResponse({ success: false, error: '未知命令' });
  }

  return true;
});

// 监听标签页关闭
chrome.tabs.onRemoved.addListener((tabId) => {
  if (scrapeState.currentTabId === tabId) {
    console.log('[GeminiScraper] 标签页关闭');
    scrapeState.isScraping = false;
    scrapeState.currentTabId = null;
  }
});

console.log('[GeminiScraper] Background script已加载');
