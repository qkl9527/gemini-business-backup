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
  let config = {
    delayBetweenChats: 1000,
    delayAfterClick: 8000
  };

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

  const logger = new Logger('debug');

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 获取对话列表项（点击内部的.list-item元素）
  // 获取对话列表项（包含展开"显示更多"）
  async function getChatItems() {
    const navPanel = document.querySelector('ucs-standalone-app').shadowRoot.querySelector("ucs-nav-panel");
    if (!navPanel || !navPanel.shadowRoot) {
      logger.warn('未找到导航面板');
      return [];
    }
    const navShadow = navPanel.shadowRoot;
    const conversationList = navShadow.querySelector(".conversation-list");
    if (!conversationList) {
      logger.warn('未找到对话列表');
      return [];
    }

    const items = [];

    // 获取初始列表
    const initialContainers = conversationList.querySelectorAll(".conversation-container");
    initialContainers.forEach(container => {
      const listItem = container.querySelector('.list-item');
      if (listItem) {
        items.push(listItem);
      }
    });

    logger.info(`初始找到 ${items.length} 个对话项`);

    // 检查是否有"显示更多"按钮
    const showMoreContainer = conversationList.querySelector(".show-more-container");
    if (showMoreContainer) {
      const showMoreBtn = showMoreContainer.querySelector(".show-more");
      if (showMoreBtn) {
        logger.info('发现"显示更多"按钮，尝试展开...');
        try {
          showMoreBtn.click();
          logger.info('已点击"显示更多"，等待加载...');

          // 等待展开
          await new Promise(resolve => setTimeout(resolve, 2000));

          // 获取展开后的列表
          const moreList = conversationList.querySelector(".more-conversation-list");
          if (moreList) {
            const moreContainers = moreList.querySelectorAll(".conversation-container");
            logger.info(`展开后新增 ${moreContainers.length} 个对话项`);

            moreContainers.forEach(container => {
              const listItem = container.querySelector('.list-item');
              if (listItem) {
                items.push(listItem);
              }
            });
          }
        } catch (e) {
          logger.warn(`展开"显示更多"失败: ${e.message}`);
        }
      }
    }

    logger.info(`共找到 ${items.length} 个对话项`);
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

  // 从img元素获取图片数据（直接在DOM中提取，绕过CORS）
  async function getImageDataFromElement(imgEl) {
    try {
      if (!imgEl || !imgEl.src) return null;

      if (imgEl.src.startsWith('data:')) {
        const base64Data = imgEl.src.split(',')[1];
        const mimeType = imgEl.src.split(';')[0].replace('data:', '') || 'image/png';
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        return {
          data: Array.from(binaryData),
          mimeType: mimeType,
          originalSrc: imgEl.src
        };
      }

      // 图片已加载完成
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        return await drawImageToBlob(imgEl);
      }

      // 图片未加载，等待
      if (!imgEl.complete) {
        logger.debug('图片未完成加载，等待...');
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
            imgEl.onload = () => {
              clearTimeout(timeout);
              resolve();
            };
            imgEl.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('error'));
            };
          });
        } catch (e) {
          logger.debug(`图片加载结果: ${e.message}`);
        }
      }

      // 再次检查尺寸
      if (imgEl.naturalWidth > 0) {
        return await drawImageToBlob(imgEl);
      }

      logger.warn(`无法获取图片数据，尺寸为0`);
      return null;
    } catch (e) {
      logger.warn(`获取图片数据失败: ${e.message}`);
      return null;
    }
  }

  async function drawImageToBlob(imgEl) {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0);

        canvas.toBlob((blob) => {
          if (blob) {
            blob.arrayBuffer().then(buffer => {
              resolve({
                data: Array.from(new Uint8Array(buffer)),
                mimeType: blob.type || 'image/png',
                originalSrc: imgEl.src
              });
            }).catch(() => resolve(null));
          } else {
            resolve(null);
          }
        }, 'image/png', 0.95);
      } catch (e) {
        resolve(null);
      }
    });
  }

  // 提取单个turn的用户内容（包含图片下载）
  async function extractTurnUserContent(turn, previewWaitTime = 5000) {
    const result = { text: '', images: [] };
    const processedImages = new Set();

    // 提取用户文本
    const markdownEl = turn.querySelector(".question-block ucs-fast-markdown");
    if (markdownEl && markdownEl.shadowRoot) {
      const span = markdownEl.shadowRoot.querySelector(".markdown-document");
      if (span) {
        result.text = span.textContent.trim();
      }
    }

    // 处理用户上传的文件图片（从 carousel previewable）
    const carouselContainer = turn.querySelector("ucs-carousel");
    if (carouselContainer && carouselContainer.shadowRoot) {
      logger.warn("carouselContainer.shadowRoot:", carouselContainer.shadowRoot)
      const previewables = carouselContainer.querySelectorAll(".previewable");
      logger.warn("previewables:", previewables)
      for (const previewable of previewables) {
        try {
          previewable.click();
          await sleep(previewWaitTime);

          const previewEl = document.querySelector('ucs-standalone-app')?.shadowRoot
            ?.querySelector(".ucs-standalone-outer-row-container ucs-results")?.shadowRoot
            ?.querySelector("ucs-document-preview");
          
          if (previewEl && previewEl.shadowRoot) {
            const previewImg = previewEl.shadowRoot.querySelector('.document-viewer-contents img');
            if (previewImg && previewImg.src) {
              if (!processedImages.has(previewImg.src)) {
                processedImages.add(previewImg.src);
                const imgData = await getImageDataFromElement(previewImg);
                if (imgData) {
                  result.images.push({
                    type: 'image',
                    src: previewImg.src,
                    role: 'user',
                    data: imgData.data,
                    mimeType: imgData.mimeType
                  });
                }
              }
            }
          }
        } catch (e) {
          logger.debug(`carousel 图片获取跳过: ${e.message}`);
        }
      }
    }

    return result;
  }

  // 提取单个turn的AI内容（包含图片下载）
  async function extractTurnAIResponse(turn, alreadyProcessedImages = new Set()) {
    const result = { text: '', images: [] };
    const processedImages = new Set(alreadyProcessedImages);

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
          for (const imgEl of markdownImages) {
            if (imgEl && imgEl.shadowRoot) {
              const img = imgEl.shadowRoot.querySelector("img");
              if (img && img.src) {
                if (processedImages.has(img.src)) {
                  continue;
                }
                processedImages.add(img.src);

                let imgData = null;
                try {
                  imgData = await getImageDataFromElement(img);
                } catch (e) {
                  logger.debug(`图片下载跳过: ${e.message}`);
                }
                result.images.push({
                  type: 'image',
                  src: img.src,
                  role: 'ai',
                  data: imgData ? imgData.data : null,
                  mimeType: imgData ? imgData.mimeType : null
                });
              }
            }
          }
        }
      }
    }

    return result;
  }

  // 提取所有消息（处理所有turns，包含图片下载）
  async function extractMessages(previewWaitTime = 5000) {
    const messages = [];
    const turns = getTurns();

    logger.info(`找到 ${turns.length} 个对话轮次`);

    if (turns.length === 0) {
      logger.warn('未找到任何对话轮次');
      return messages;
    }

    // 处理每个turn
    for (const turn of turns) {
      // 提取用户内容
      const userContent = await extractTurnUserContent(turn, previewWaitTime);
      logger.warn("userContent:", userContent);
      if (userContent.text || userContent.images.length > 0) {
        messages.push({
          role: 'user',
          text: userContent.text,
          images: userContent.images,
          turnIndex: messages.length + 1
        });
      }

      // 收集已提取的图片，避免重复
      const processedImages = new Set();
      for (const img of userContent.images) {
        if (img.src) {
          processedImages.add(img.src);
        }
      }

      // 提取AI内容（可能是文本或图片，不是同时存在）
      const aiContent = await extractTurnAIResponse(turn, processedImages);
      if (aiContent.text || aiContent.images.length > 0) {
        messages.push({
          role: 'ai',
          text: aiContent.text,
          images: aiContent.images,
          turnIndex: messages.length + 1
        });
      }
    }

    logger.info(`提取到 ${messages.length} 条消息`);
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
  async function scrapeSingleChat(chatElement, index, total, previewWaitTime = 5000) {
    try {
      const title = extractChatTitle(chatElement);
      logger.info(`[${index}/${total}] "${title}"`);

      const clicked = await clickChat(chatElement);
      if (!clicked) {
        logger.warn(`[${index}/${total}] 点击后未加载内容`);
      }

      await sleep(config.delayAfterClick);

      let messages = [];
      try {
        messages = await extractMessages(previewWaitTime);
      } catch (e) {
        logger.warn(`[${index}/${total}] 提取消息失败: ${e.message}`);
      }

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
  async function startScraping(requestConfig = {}) {
    if (isScraping) {
      return { success: false, error: '抓取已在进行中' };
    }

    if (!window.location.hostname.includes('business.gemini.google')) {
      return { success: false, error: '请在Gemini页面使用' };
    }

    const startIndex = parseInt(requestConfig.exportStartIndex) || 0;
    const exportCount = parseInt(requestConfig.exportCount) || 0;
    const useRange = requestConfig.useRange === true;

    config = {
      delayBetweenChats: requestConfig.delayBetweenChats || 500,
      delayAfterClick: requestConfig.delayAfterClick || 3000,
      previewWaitTime: requestConfig.previewWaitTime || 5000
    };

    try {
      isScraping = true;
      scrapedChats = [];
      currentChatIndex = 0;

      logger.info('========================================');
      logger.info(`开始抓取 Gemini 聊天记录`);
      logger.info(`间隔: ${config.delayBetweenChats}ms, 等待: ${config.delayAfterClick}ms`);
      if (useRange) {
        logger.info(`范围抓取: 开始=${startIndex}, 数量=${exportCount || '全部'}`);
      }
      logger.info('========================================');

      chatItems = await getChatItems();
      totalChats = chatItems.length;
      logger.info(`共发现 ${totalChats} 个对话`);

      if (chatItems.length === 0) {
        throw new Error('未找到任何对话项');
      }

      let startIdx = 0;
      let endIdx = chatItems.length;

      if (useRange) {
        startIdx = Math.max(0, startIndex);
        if (startIdx >= totalChats) {
          throw new Error(`开始位置(${startIdx})超出范围(0-${totalChats-1})`);
        }
        if (exportCount > 0) {
          endIdx = Math.min(startIdx + exportCount, totalChats);
        }
        logger.info(`实际抓取范围: 索引 ${startIdx} - ${endIdx - 1} (共 ${endIdx - startIdx} 个)`);
      }

      for (let i = startIdx; i < endIdx; i++) {
        if (!isScraping) {
          logger.info('用户停止抓取');
          break;
        }

        currentChatIndex = i + 1;
        logger.info(`开始处理第 ${i + 1}/${totalChats} 个对话 (索引${i})`);
        await scrapeSingleChat(chatItems[i], currentChatIndex, totalChats, config.previewWaitTime);
        logger.info(`第 ${currentChatIndex}/${totalChats} 个对话处理完成`);

        if (i < endIdx - 1) {
          await sleep(config.delayBetweenChats);
        }
      }

      logger.info('========================================');
      logger.info(`抓取完成！共 ${scrapedChats.length} 个对话`);
      logger.info('========================================');

      const batchNumber = requestConfig.batchNumber || 1;

      chrome.runtime.sendMessage({
        type: 'batch-complete',
        batchNumber: batchNumber,
        chatCount: scrapedChats.length,
        startIndex: startIdx,
        totalChats: totalChats
      }).catch(e => {
        logger.debug(`发送 batch-complete 失败: ${e.message}`);
      });

      if (scrapedChats.length > 0) {
        logger.info(`开始分片传输 ${scrapedChats.length} 个对话...`);
        await packageAndTransfer(scrapedChats, startIdx);
      }

      isScraping = false;
      return { success: true, message: '抓取完成' };

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

  async function fetchImages(images) {
    const result = {};
    const processedUrls = new Set();
    let count = 0;
    let failed = 0;

    logger.info(`开始获取 ${images.length} 张图片`);

    for (const img of images) {
      if (!img || !img.src) {
        logger.warn('跳过无效图片数据');
        continue;
      }

      if (processedUrls.has(img.src)) {
        logger.debug(`跳过重复图片: ${img.src.substring(0, 50)}...`);
        continue;
      }

      try {
        let arrayBuffer;
        let mimeType;
        let ext;

        if (img.src.startsWith('blob:')) {
          logger.debug(`Fetching blob URL: ${img.src.substring(0, 80)}...`);

          try {
            const response = await fetch(img.src);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            arrayBuffer = await response.arrayBuffer();
            mimeType = response.headers.get('content-type') || 'image/png';
            ext = mimeType.split('/')[1]?.split(';')[0] || 'png';
          } catch (fetchError) {
            logger.warn(`fetch失败，尝试从DOM获取: ${fetchError.message}`);
            const domResult = await fetchImageFromDOM(img.src);
            if (domResult) {
              arrayBuffer = domResult.buffer;
              mimeType = domResult.mimeType;
              ext = domResult.mimeType.split('/')[1] || 'png';
            } else {
              throw new Error('无法从DOM获取');
            }
          }

        } else if (img.src.startsWith('data:')) {
          logger.debug('解析 data URI');
          try {
            const base64Data = img.src.split(',')[1];
            if (!base64Data) throw new Error('Invalid data URI');
            mimeType = img.src.split(';')[0].replace('data:', '') || 'image/png';
            ext = mimeType.split('/')[1]?.split(';')[0] || 'png';
            arrayBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer;
          } catch (e) {
            logger.warn(`解析data URI失败: ${e.message}`);
            failed++;
            continue;
          }
        } else {
          logger.warn(`不支持的URL类型: ${img.src.substring(0, 50)}`);
          continue;
        }

        const cleanMimeType = mimeType.split(';')[0].trim();
        const localPath = `images/image_${Date.now()}_${count}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

        result[localPath] = {
          data: Array.from(new Uint8Array(arrayBuffer)),
          mimeType: cleanMimeType,
          originalSrc: img.src,
          originalRole: img.role
        };

        processedUrls.add(img.src);
        count++;
        logger.debug(`成功获取图片 ${count}: ${localPath}`);

      } catch (e) {
        failed++;
        logger.warn(`获取图片失败: ${img.src.substring(0, 50)}... - ${e.message}`);
      }
    }

    logger.info(`图片获取完成: ${count} 成功, ${failed} 失败`);
    return { success: true, images: result, count, failed };
  }

  async function fetchImageFromDOM(blobUrl) {
    try {
      const allImages = document.querySelectorAll('img');
      for (const img of allImages) {
        if (img.src === blobUrl || img.src.startsWith(blobUrl)) {
          logger.debug(`在DOM中找到对应img元素`);

          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          if (canvas.width === 0 || canvas.height === 0) {
            logger.warn(`图片尺寸为0，跳过`);
            continue;
          }

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          return new Promise((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                blob.arrayBuffer().then(buffer => {
                  resolve({
                    buffer: buffer,
                    mimeType: blob.type || 'image/png'
                  });
                }).catch(() => resolve(null));
              } else {
                resolve(null);
              }
            }, 'image/png', 0.95);
          });
        }
      }
      logger.warn(`在DOM中未找到对应img元素: ${blobUrl.substring(0, 50)}`);
      return null;
    } catch (e) {
      logger.warn(`从DOM获取图片失败: ${e.message}`);
      return null;
    }
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
        sendResponse({ success: true, message: '开始抓取' });
        startScraping(request.config).then(result => {
          if (result.success) {
            const chatCount = result.chats ? result.chats.length : 0;
            logger.info(`抓取完成: ${chatCount}条对话`);
          } else {
            logger.info(`抓取完成: ${result.error || '未知错误'}`);
          }
        }).catch(e => {
          logger.error(`抓取失败: ${e.message}`);
        });
        break;

      case 'stopScraping':
        sendResponse(stopScraping());
        break;

      case 'ping':
        sendResponse({ success: true, message: 'Content script已就绪', isScraping });
        break;

      case 'debug':
        const turns = getTurns();
        const items = conversationList.querySelectorAll('.conversation-container');
        sendResponse({
          success: true,
          turnsCount: turns.length,
          chatItemsCount: items.length,
          isScraping
        });
        break;

      case 'fetchImages':
        (async () => {
          try {
            const result = await fetchImages(request.images);
            sendResponse(result);
          } catch (e) {
            sendResponse({ success: false, error: e.message });
          }
        })();
        return true;

      case 'packageAndTransfer':
        packageAndTransfer(request.chats, request.startIndex, request.chunkSize).catch(e => {
          logger.error(`传输失败: ${e.message}`);
        });
        break;

      default:
        sendResponse({ success: false, error: '未知命令' });
    }
  });

  // 分片传输配置
  const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

  async function packageAndTransfer(chats, startIndex, customChunkSize) {
    if (!chats || chats.length === 0) return;

    const chunkSize = customChunkSize || DEFAULT_CHUNK_SIZE;
    logger.info(`打包并传输 ${chats.length} 个对话... (分片: ${(chunkSize / 1024 / 1024).toFixed(0)}MB)`);

    const zip = new JSZip();
    let imageCount = 0;

    for (const chat of chats) {
      const chatIndex = chat.index || 0;
      const safeTitle = sanitizeFilename(chat.title || `chat-${chatIndex}`);
      const chatFolder = zip.folder(`chat_${chatIndex}_${safeTitle}`);

      if (chat.messages && chat.messages.length > 0) {
        const chatCopy = JSON.parse(JSON.stringify(chat));

        if (chatCopy.messages) {
          for (const msg of chatCopy.messages) {
            if (msg.images && msg.images.length > 0) {
              for (const img of msg.images) {
                if (img.data && img.mimeType) {
                  imageCount++;
                  const ext = img.mimeType.split('/')[1]?.split(';')[0] || 'png';
                  const imgFilename = `image_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${ext}`;
                  const imgData = new Uint8Array(img.data);
                  const relativePath = `images/${imgFilename}`;
                  chatFolder.file(relativePath, imgData);

                  img.data = null;
                  img.src = relativePath;
                }
              }
            }
          }
        }

        chatFolder.file('chat.json', JSON.stringify(chatCopy, null, 2));
        chatFolder.file('chat.md', generateMarkdown(chatCopy));
      }
    }

    const metadata = {
      exportTime: new Date().toISOString(),
      startIndex: startIndex,
      chatCount: chats.length,
      imageCount: imageCount,
      sourceUrl: window.location.href
    };

    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const content = await zip.generateAsync({ type: 'uint8array' });

    const transferMetadata = {
      filename: `gemini-chats-idx${startIndex}-${chats.length}-${Date.now()}.zip`,
      size: content.length,
      chatCount: chats.length,
      imageCount: imageCount,
      transferId: transferId
    };

    logger.info(`ZIP大小: ${content.length} bytes, 开始分片传输...`);

    await chrome.runtime.sendMessage({
      type: 'transfer-start',
      transferId: transferId,
      metadata: transferMetadata
    });

    const totalChunks = Math.ceil(content.length / chunkSize);
    logger.info(`Total chunks: ${totalChunks}, chunkSize: ${chunkSize}`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, content.length);
      const chunk = content.slice(start, end);

      await chrome.runtime.sendMessage({
        type: 'chunk',
        transferId: transferId,
        chunkIndex: i,
        totalChunks: totalChunks,
        data: Array.from(chunk),
        isLast: i === totalChunks - 1
      });

      if (i % 10 === 0 || i === totalChunks - 1) {
        logger.debug(`Chunk ${i + 1}/${totalChunks} sent`);
      }

      if (i % 50 === 0 && i < totalChunks - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    await chrome.runtime.sendMessage({
      type: 'transfer-end',
      transferId: transferId
    });

    logger.info(`传输完成: ${transferMetadata.filename}`);
  }

  function sanitizeFilename(name) {
    if (!name) return 'untitled';
    return name.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
  }

  function generateMarkdown(chat) {
    let md = `# ${chat.title || 'Untitled Chat'}\n\n`;
    md += `*Scraped at: ${chat.timestamp || new Date().toISOString()}*\n\n`;
    md += `---\n\n`;

    for (const msg of chat.messages || []) {
      const role = msg.role === 'user' ? 'User' : 'Gemini';
      md += `## ${role}\n\n`;
      if (msg.text) md += `${msg.text}\n\n`;

      if (msg.images && msg.images.length > 0) {
        for (const img of msg.images) {
          if (img.src) {
            md += `![Image](${img.src})\n\n`;
          }
        }
      }

      md += `---\n\n`;
    }

    return md;
  }

  logger.info('Gemini Chat Scraper已加载');

})();
