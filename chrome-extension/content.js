/**
 * Gemini Chat Scraper - Content Script
 * 第一阶段：基础文本抓取
 * 支持Shadow DOM
 */

(function() {
  'use strict';

  // 状态管理
  let isScraping = false;
  let scrapedChats = [];
  let currentChatIndex = 0;

  // Logger类
  class Logger {
    constructor(level = 'info') {
      this.level = level;
      this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
    }

    log(level, ...args) {
      if (this.levels[level] <= this.levels[this.level]) {
        const prefix = '[GeminiScraper]';
        console[level](prefix, ...args);
        this.sendToPopup(level, args.join(' '));
      }
    }

    error(...args) { this.log('error', ...args); }
    warn(...args) { this.log('warn', ...args); }
    info(...args) { this.log('info', ...args); }
    debug(...args) { this.log('debug', ...args); }

    async sendToPopup(level, message) {
      try {
        await chrome.runtime.sendMessage({
          type: 'log',
          level: level,
          message: message
        });
      } catch (e) {
        // Popup可能未打开，忽略错误
      }
    }
  }

  const logger = new Logger('info');

  // 工具函数
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Shadow DOM选择器查询器
  function querySelectorDeep(selectors) {
    const parts = selectors.split(' ').filter(s => s);
    if (parts.length === 0) return null;

    let current = document;
    for (const part of parts) {
      if (!current) return null;

      let element = current.querySelector ? current.querySelector(part) : null;

      if (!element && current.shadowRoot) {
        element = current.shadowRoot.querySelector(part);
      }

      if (!element) {
        element = querySelectorInShadow(current, part);
      }

      if (!element) return null;
      current = element;
    }

    return current;
  }

  // 在元素及其shadow DOM中递归查找
  function querySelectorInShadow(root, selector) {
    if (root.shadowRoot && root.shadowRoot.querySelector) {
      const found = root.shadowRoot.querySelector(selector);
      if (found) return found;
    }

    const children = root.querySelectorAll('*');
    for (const child of children) {
      if (child.shadowRoot) {
        const found = child.shadowRoot.querySelector(selector);
        if (found) return found;

        const deepFound = querySelectorInShadow(child, selector);
        if (deepFound) return deepFound;
      }
    }

    return null;
  }

  // 查询所有匹配元素
  function querySelectorAllDeep(selectors) {
    const parts = selectors.split(' ').filter(s => s);
    if (parts.length === 0) return [];

    const lastSelector = parts.pop();
    const parentPath = parts.join(' ');

    let parent;
    if (parentPath) {
      parent = querySelectorDeep(parentPath);
    } else {
      parent = document;
    }

    if (!parent) return [];

    let results = [];

    if (parent.querySelectorAll) {
      results = Array.from(parent.querySelectorAll(lastSelector));
    }

    if (results.length === 0 && parent.shadowRoot) {
      results = Array.from(parent.shadowRoot.querySelectorAll(lastSelector));
    }

    if (results.length === 0) {
      results = querySelectorAllInShadow(parent, lastSelector);
    }

    return results;
  }

  // 递归查找所有匹配元素（包含shadow DOM）
  function querySelectorAllInShadow(root, selector) {
    let results = [];

    if (root.shadowRoot) {
      const shadowResults = root.shadowRoot.querySelectorAll(selector);
      results = Array.from(shadowResults);
    }

    const children = root.querySelectorAll('*');
    for (const child of children) {
      if (child.shadowRoot) {
        const shadowResults = child.shadowRoot.querySelectorAll(selector);
        results = results.concat(Array.from(shadowResults));

        const deepResults = querySelectorAllInShadow(child, selector);
        results = results.concat(deepResults);
      }
    }

    return results;
  }

  // 获取Shadow Host
  function getShadowHost() {
    return document.querySelector('ucs-standalone-app');
  }

  // 等待元素出现（支持Shadow DOM）
  async function waitForElement(selector, timeout = 10000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const element = querySelectorDeep(selector);
      if (element && element.offsetParent !== null) {
        return element;
      }
      await sleep(100);
    }
    throw new Error(`元素 ${selector} 未在 ${timeout}ms 内找到`);
  }

  // 检测是否是Gemini页面
  function isGeminiPage() {
    return window.location.hostname.includes('business.gemini.google');
  }

  // 获取对话列表容器（Shadow DOM）
  function getChatListContainer() {
    logger.info('正在获取对话列表容器（Shadow DOM）...');

    const shadowSelectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list',
      'ucs-standalone-app .conversation-list',
      '[class*="conversation-list"]'
    ];

    for (const selector of shadowSelectors) {
      try {
        const container = querySelectorDeep(selector);
        if (container) {
          logger.info(`✓ 找到对话列表容器: ${selector}`);
          return container;
        }
      } catch (e) {
        logger.debug(`选择器 ${selector} 失败`);
      }
    }

    throw new Error('找不到对话列表容器');
  }

  // 展开所有对话
  async function expandAllChats() {
    logger.info('检查是否需要展开对话列表...');

    const expandSelectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list .show-more-container',
      '.conversation-list .show-more-container',
      '.show-more-container'
    ];

    let expanded = false;
    for (const selector of expandSelectors) {
      try {
        const button = querySelectorDeep(selector);
        if (button && button.offsetParent !== null && !button.disabled) {
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            logger.info('✓ 发现展开按钮，点击...');
            button.click();
            await sleep(2000);
            expanded = true;
            break;
          }
        }
      } catch (e) {
        logger.debug(`展开按钮 ${selector} 未找到`);
      }
    }

    if (!expanded) {
      logger.info('未发现展开按钮或已全部展开');
    }

    return expanded;
  }

  // 获取所有对话项
  function getChatItems() {
    const container = getChatListContainer();

    const itemSelectors = [
      '.conversation-list-item',
      '[class*="conversation-list-item"]',
      '[class*="chat-item"]'
    ];

    for (const selector of itemSelectors) {
      const items = querySelectorAllDeep(
        `ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list ${selector}`
      );

      if (items.length === 0) {
        const directItems = container.querySelectorAll ?
          Array.from(container.querySelectorAll(selector)) : [];
        if (directItems.length > 0) {
          logger.info(`✓ 找到 ${directItems.length} 个对话项 (${selector})`);
          return directItems;
        }
      } else {
        logger.info(`✓ 找到 ${items.length} 个对话项 (${selector})`);
        return items;
      }
    }

    const children = container.children ?
      Array.from(container.children).filter(child => child.offsetParent !== null) : [];

    if (children.length > 0) {
      logger.info(`找到 ${children.length} 个子元素作为对话项`);
      return children;
    }

    throw new Error('找不到对话项，请检查DOM结构');
  }

  // 提取单个对话的基本信息
  function extractChatInfo(chatElement) {
    const titleSelectors = [
      '[class*="title"]',
      '[class*="name"]',
      'span',
      'div'
    ];

    let title = '未命名对话';

    for (const selector of titleSelectors) {
      const titleEl = chatElement.querySelector ? chatElement.querySelector(selector) : null;
      if (!titleEl && chatElement.shadowRoot) {
        const shadowEl = chatElement.shadowRoot.querySelector(selector);
        if (shadowEl && shadowEl.textContent.trim()) {
          title = shadowEl.textContent.trim().substring(0, 100);
          break;
        }
      } else if (titleEl && titleEl.textContent.trim()) {
        title = titleEl.textContent.trim().substring(0, 100);
        break;
      }
    }

    return {
      title: title,
      element: chatElement
    };
  }

  // 点击对话
  async function clickChat(chatElement) {
    logger.debug('点击对话...');

    const clickMethods = [
      () => chatElement.click(),
      () => {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        chatElement.dispatchEvent(event);
      },
      () => {
        chatElement.focus();
        chatElement.dispatchEvent(new KeyboardEvent('Enter', { key: 'Enter', bubbles: true }));
      }
    ];

    for (const method of clickMethods) {
      try {
        method();
        await sleep(2000);

        const contentElement = querySelectorDeep('.content');
        if (contentElement && contentElement.offsetParent !== null) {
          logger.debug('✓ 对话内容已加载');
          return true;
        }
      } catch (e) {
        logger.debug('点击失败，尝试其他方式');
      }
    }

    await sleep(3000);
    return true;
  }

  // 获取对话内容区域
  function getChatContentArea() {
    const contentSelectors = [
      'ucs-standalone-app .content',
      '.content',
      '[class*="message-container"]',
      '[class*="chat-content"]'
    ];

    for (const selector of contentSelectors) {
      const element = querySelectorDeep(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  // 等待对话内容加载
  async function waitForChatContent() {
    const contentSelectors = [
      '.content',
      '[class*="message-container"]',
      '[class*="chat-content"]'
    ];

    for (const selector of contentSelectors) {
      try {
        await waitForElement(selector, 5000);
        logger.debug(`✓ 找到内容区域: ${selector}`);
        return;
      } catch (e) {
        logger.debug(`内容选择器 ${selector} 未找到`);
      }
    }

    await sleep(2000);
  }

  // 提取消息内容
  function extractMessages() {
    const messages = [];

    const contentArea = getChatContentArea();
    if (!contentArea) {
      logger.warn('找不到内容区域');
      return messages;
    }

    const messageSelectors = [
      '[class*="message"]',
      '[class*="text-container"]',
      '[role="article"]'
    ];

    let messageElements = [];

    for (const selector of messageSelectors) {
      const found = contentArea.querySelectorAll ?
        Array.from(contentArea.querySelectorAll(selector)) : [];
      if (found.length === 0 && contentArea.shadowRoot) {
        found.push(...Array.from(contentArea.shadowRoot.querySelectorAll(selector)));
      }

      if (found.length > 0) {
        messageElements = found;
        logger.debug(`使用选择器 ${selector} 找到 ${messageElements.length} 个消息`);
        break;
      }
    }

    messageElements.forEach((msgEl, index) => {
      try {
        let text = msgEl.textContent?.trim();

        if (!text && msgEl.shadowRoot) {
          text = msgEl.shadowRoot.textContent?.trim();
        }

        if (text && text.length > 0) {
          const isUser = msgEl.classList.contains('user') ||
                        msgEl.classList.contains('human') ||
                        msgEl.closest('[class*="user"]') ||
                        (msgEl.getAttribute('class') || '').includes('user') ||
                        (msgEl.getAttribute('class') || '').includes('human');

          messages.push({
            role: isUser ? 'user' : 'ai',
            content: text,
            index: index + 1
          });
        }
      } catch (e) {
        logger.warn(`提取消息 ${index} 失败: ${e.message}`);
      }
    });

    logger.info(`✓ 提取到 ${messages.length} 条消息`);
    return messages;
  }

  // 发送进度到popup
  async function sendProgress(current, total) {
    try {
      await chrome.runtime.sendMessage({
        type: 'progress',
        current: current,
        total: total,
        chats: scrapedChats
      });
    } catch (e) {
      // Popup可能未打开
    }
  }

  // 抓取单个对话
  async function scrapeSingleChat(chatElement, index, total) {
    try {
      logger.info(`开始抓取第 ${index}/${total} 个对话`);

      const chatInfo = extractChatInfo(chatElement);
      logger.info(`对话标题: ${chatInfo.title}`);

      await clickChat(chatElement);
      await waitForChatContent();
      const messages = extractMessages();

      const chatData = {
        index: index,
        title: chatInfo.title,
        timestamp: new Date().toISOString(),
        messages: messages,
        messageCount: messages.length
      };

      scrapedChats.push(chatData);
      logger.info(`✓ ${chatInfo.title} - ${messages.length} 条消息`);
      await sendProgress(index, total);

      return chatData;

    } catch (error) {
      logger.error(`抓取对话 ${index} 失败: ${error.message}`);

      scrapedChats.push({
        index: index,
        title: '抓取失败',
        error: error.message,
        messages: []
      });

      return null;
    }
  }

  // 主抓取流程
  async function startScraping() {
    if (isScraping) {
      logger.warn('抓取已在进行中');
      return { success: false, error: '抓取已在进行中' };
    }

    if (!isGeminiPage()) {
      logger.error('当前不是Gemini页面');
      return { success: false, error: '请在Gemini页面使用此功能' };
    }

    try {
      isScraping = true;
      scrapedChats = [];
      currentChatIndex = 0;

      logger.info('========================================');
      logger.info('开始抓取 Gemini 聊天记录');
      logger.info('页面: ' + window.location.href);
      logger.info('========================================');

      const shadowHost = getShadowHost();
      if (shadowHost) {
        logger.info('✓ 检测到Shadow DOM结构');
      } else {
        logger.warn('⚠ 未检测到Shadow Host');
      }

      await expandAllChats();
      const chatItems = getChatItems();
      logger.info(`共发现 ${chatItems.length} 个对话`);

      if (chatItems.length === 0) {
        throw new Error('未找到任何对话项');
      }

      for (let i = 0; i < chatItems.length; i++) {
        if (!isScraping) {
          logger.info('用户停止抓取');
          break;
        }

        currentChatIndex = i + 1;
        await scrapeSingleChat(chatItems[i], i + 1, chatItems.length);

        if (i < chatItems.length - 1) {
          await sleep(500);
        }
      }

      logger.info('========================================');
      logger.info(`抓取完成！共抓取 ${scrapedChats.length} 个对话`);
      logger.info('========================================');

      return {
        success: true,
        chats: scrapedChats,
        total: scrapedChats.length
      };

    } catch (error) {
      logger.error(`抓取过程出错: ${error.message}`);
      console.error(error);
      return {
        success: false,
        error: error.message,
        chats: scrapedChats
      };
    } finally {
      isScraping = false;
    }
  }

  // 停止抓取
  function stopScraping() {
    isScraping = false;
    logger.info('停止抓取请求已收到');
    return { success: true, message: '正在停止...' };
  }

  // 获取当前状态
  function getStatus() {
    return {
      isScraping: isScraping,
      currentChatIndex: currentChatIndex,
      scrapedCount: scrapedChats.length
    };
  }

  // 导出辅助函数供调试使用
  window.geminiScraperUtils = {
    querySelectorDeep,
    querySelectorAllDeep,
    getShadowHost,
    getChatListContainer,
    getChatItems,
    getChatContentArea,
    sleep
  };

  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logger.debug(`收到消息: ${request.action}`);

    switch (request.action) {
      case 'startScraping':
        startScraping()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;

      case 'stopScraping':
        const result = stopScraping();
        sendResponse(result);
        break;

      case 'getStatus':
        sendResponse(getStatus());
        break;

      case 'ping':
        sendResponse({ success: true, message: 'Content script已就绪（支持Shadow DOM）' });
        break;

      case 'debug':
        const shadowHost = getShadowHost();
        sendResponse({
          success: true,
          hasShadowHost: !!shadowHost,
          chatListContainer: getChatListContainer() ? 'found' : 'not found',
          chatItemsCount: getChatItems().length
        });
        break;

      default:
        sendResponse({ success: false, error: '未知命令' });
    }
  });

  // 初始化完成
  logger.info('Gemini Chat Scraper Content Script已加载（支持Shadow DOM）');
  logger.info(`页面: ${window.location.href}`);

})();
