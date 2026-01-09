/**
 * Gemini Chat Scraper - Content Script
 */

(function() {
  'use strict';

  // 状态管理
  let isScraping = false;
  let scrapedChats = [];
  let currentChatIndex = 0;
  let totalChats = 0;
  let chatItems = [];

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
        await chrome.runtime.sendMessage({ type: 'log', level, message });
      } catch (e) {}
    }
  }

  const logger = new Logger('info');

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取对话列表项（点击内部的.list-item元素）
  function getChatItems() {
    const containers = document.querySelector('ucs-standalone-app').shadowRoot.querySelector("ucs-nav-panel").shadowRoot.querySelectorAll(".conversation-list .conversation-container");
    
    const items = [];
    containers.forEach(container => {
      const listItem = container.querySelector('.list-item');
      if (listItem) {
        items.push(listItem);
      }
    });
    
    logger.info(`找到 ${items.length} 个对话项（.list-item）`);
    return items;
  }

  // 获取所有turns
  function getTurns() {
    const app = document.querySelector('ucs-standalone-app');
    if (!app || !app.shadowRoot) return [];
    
    const results = app.shadowRoot.querySelector(".ucs-standalone-outer-row-container ucs-results");
    if (!results || !results.shadowRoot) return [];
    
    const conv = results.shadowRoot.querySelector("ucs-conversation");
    if (!conv || !conv.shadowRoot) return [];
    
    return conv.shadowRoot.querySelectorAll(".main .turn");
  }

  // 提取单个turn的用户内容
  function extractTurnUserContent(turn) {
    const result = { text: '', images: [] };

    // 提取用户文本
    const markdownEl = turn.querySelector(".question-block ucs-fast-markdown");
    if (markdownEl && markdownEl.shadowRoot) {
      const span = markdownEl.shadowRoot.querySelector(".markdown-document");
      if (span) {
        result.text = span.textContent.trim();
      }
    }

    // 提取用户图片（如果存在）
    const summaryEl = turn.querySelector("ucs-summary");
    if (summaryEl && summaryEl.shadowRoot) {
      const attachmentsEl = summaryEl.shadowRoot.querySelector("ucs-summary-attachments");
      if (attachmentsEl && attachmentsEl.shadowRoot) {
        const containerEl = attachmentsEl.shadowRoot.querySelector(".attachment-container");
        if (containerEl) {
          const markdownImages = containerEl.querySelectorAll("ucs-markdown-image");
          markdownImages.forEach(imgEl => {
            if (imgEl && imgEl.shadowRoot) {
              const img = imgEl.shadowRoot.querySelector("img");
              if (img && img.src) {
                result.images.push({ type: 'image', src: img.src, role: 'user' });
              }
            }
          });
        }
      }
    }

    return result;
  }

  // 提取单个turn的AI内容
  function extractTurnAIResponse(turn) {
    const result = { text: '', images: [] };

    const summaryEl = turn.querySelector("ucs-summary");
    if (!summaryEl || !summaryEl.shadowRoot) {
      return result;
    }

    // 尝试提取AI文本回复
    const containerEl = summaryEl.shadowRoot.querySelector(".summary-container .summary-contents ucs-text-streamer");
    if (containerEl && containerEl.shadowRoot) {
      const responseEl = containerEl.shadowRoot.querySelector("ucs-response-markdown");
      if (responseEl && responseEl.shadowRoot) {
        const markdownEl = responseEl.shadowRoot.querySelector("ucs-fast-markdown");
        if (markdownEl && markdownEl.shadowRoot) {
          const docEl = markdownEl.shadowRoot.querySelector(".markdown-document");
          if (docEl) {
            result.text = docEl.outerHTML;
          }
        }
      }
    }

    // 如果没有文本，尝试提取AI图片（另一种回复方式）
    if (!result.text) {
      const summaryAttachmentsContainer = summaryEl.shadowRoot.querySelector("ucs-summary-attachments");
      if (summaryAttachmentsContainer && summaryAttachmentsContainer.shadowRoot) {
        const attachContainer = summaryAttachmentsContainer.shadowRoot.querySelector(".attachment-container");
        if (attachContainer) {
          const markdownImages = attachContainer.querySelectorAll("ucs-markdown-image");
          markdownImages.forEach(imgEl => {
            if (imgEl && imgEl.shadowRoot) {
              const img = imgEl.shadowRoot.querySelector("img");
              if (img && img.src) {
                result.images.push({ type: 'image', src: img.src, role: 'ai' });
              }
            }
          });
        }
      }
    }

    return result;
  }

  // 提取所有消息（处理所有turns）
  function extractMessages() {
    const messages = [];
    const turns = getTurns();

    logger.info(`找到 ${turns.length} 个对话轮次`);

    if (turns.length === 0) {
      logger.warn('未找到任何对话轮次');
      return messages;
    }

    // 处理每个turn
    turns.forEach((turn, turnIndex) => {
      // 提取用户内容
      const userContent = extractTurnUserContent(turn);
      if (userContent.text || userContent.images.length > 0) {
        messages.push({
          role: 'user',
          text: userContent.text,
          images: userContent.images,
          turnIndex: turnIndex + 1
        });
      }

      // 提取AI内容（可能是文本或图片，不是同时存在）
      const aiContent = extractTurnAIResponse(turn);
      if (aiContent.text || aiContent.images.length > 0) {
        messages.push({
          role: 'ai',
          text: aiContent.text,
          images: aiContent.images,
          turnIndex: turnIndex + 1
        });
      }
    });

    logger.info(`提取到 ${messages.length} 条消息（${turns.length} 轮对话）`);
    return messages;
  }

  // 点击对话
  async function clickChat(chatElement) {
    logger.info('点击对话项...');

    const urlBefore = window.location.href;

    try {
      chatElement.click();
      logger.info('已点击，等待页面切换...');
    } catch (e) {
      try {
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        chatElement.dispatchEvent(event);
      } catch (e2) {
        logger.error('点击失败');
        return false;
      }
    }

    // 等待页面切换
    const maxWaitTime = 15000;
    let waitedTime = 0;

    while (waitedTime < maxWaitTime) {
      await sleep(1000);
      waitedTime += 1000;

      const urlAfter = window.location.href;
      const turns = getTurns();

      if (urlAfter !== urlBefore) {
        logger.info(`URL变化`);
      }

      if (turns.length > 0) {
        logger.info(`✓ 找到 ${turns.length} 轮对话`);
        return true;
      }
    }

    logger.warn('等待超时');
    return false;
  }

  async function sendProgress(current, total) {
    try {
      await chrome.runtime.sendMessage({
        type: 'progress',
        current,
        total,
        chats: scrapedChats
      });
    } catch (e) {}
  }

  // 提取对话标题
  function extractChatTitle(chatElement) {
    return chatElement.textContent.trim().substring(0, 100) || '未命名对话';
  }

  // 抓取单个对话
  async function scrapeSingleChat(chatElement, index, total) {
    try {
      const title = extractChatTitle(chatElement);
      logger.info(`[${index}/${total}] "${title}"`);

      const clicked = await clickChat(chatElement);
      if (!clicked) {
        logger.warn(`[${index}/${total}] 点击后未加载内容`);
      }

      await sleep(8000);

      const messages = extractMessages();

      const chatData = {
        index: index,
        title: title,
        timestamp: new Date().toISOString(),
        messages: messages,
        messageCount: messages.length
      };

      scrapedChats.push(chatData);
      logger.info(`[${index}/${total}] ✓ ${messages.length} 条消息`);
      await sendProgress(index, total);

      return chatData;

    } catch (error) {
      logger.error(`[${index}/${total}] 失败: ${error.message}`);
      scrapedChats.push({ index, title: '抓取失败', error: error.message, messages: [] });
      return null;
    }
  }

  // 主抓取流程
  async function startScraping() {
    if (isScraping) {
      return { success: false, error: '抓取已在进行中' };
    }

    if (!window.location.hostname.includes('business.gemini.google')) {
      return { success: false, error: '请在Gemini页面使用' };
    }

    try {
      isScraping = true;
      scrapedChats = [];
      currentChatIndex = 0;

      logger.info('========================================');
      logger.info('开始抓取 Gemini 聊天记录');
      logger.info('========================================');

      chatItems = getChatItems();
      totalChats = chatItems.length;
      logger.info(`共发现 ${totalChats} 个对话`);

      if (chatItems.length === 0) {
        throw new Error('未找到任何对话项');
      }

      for (let i = 0; i < chatItems.length; i++) {
        if (!isScraping) {
          logger.info('用户停止抓取');
          break;
        }

        currentChatIndex = i + 1;
        await scrapeSingleChat(chatItems[i], i + 1, totalChats);

        if (i < chatItems.length - 1) {
          await sleep(500);
        }
      }

      logger.info('========================================');
      logger.info(`抓取完成！共 ${scrapedChats.length} 个对话`);
      logger.info('========================================');

      isScraping = false;
      return { success: true, chats: scrapedChats, total: scrapedChats.length };

    } catch (error) {
      logger.error(`抓取出错: ${error.message}`);
      isScraping = false;
      return { success: false, error: error.message, chats: scrapedChats };
    }
  }

  function stopScraping() {
    isScraping = false;
    logger.info('停止抓取');
    return { success: true };
  }

  // 导出工具函数
  window.geminiScraperUtils = {
    getChatItems,
    getTurns,
    extractMessages,
    extractTurnUserContent,
    extractTurnAIResponse
  };

  // 监听消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    logger.debug(`消息: ${request.action}`);

    switch (request.action) {
      case 'startScraping':
        startScraping().then(result => sendResponse(result)).catch(e => sendResponse({ success: false, error: e.message }));
        return true;

      case 'stopScraping':
        sendResponse(stopScraping());
        break;

      case 'ping':
        sendResponse({ success: true, message: 'Content script已就绪', isScraping });
        break;

      case 'debug':
        try {
          const turns = getTurns();
          sendResponse({
            success: true,
            turnsCount: turns.length,
            chatItemsCount: getChatItems().length,
            isScraping
          });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
        break;

      default:
        sendResponse({ success: false, error: '未知命令' });
    }
  });

  logger.info('Gemini Chat Scraper已加载');

})();
