/**
 * Gemini Chat Scraper - Popup Script
 * 支持分批抓取，每批打包下载
 */

(function() {
  'use strict';

  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const clearBtn = document.getElementById('clear-btn');
  const exportBtn = document.getElementById('export-btn');
  const exportMdBtn = document.getElementById('export-md-btn');
  const clearLogsBtn = document.getElementById('clear-logs');
  const saveConfigBtn = document.getElementById('save-config');
  const configStatusEl = document.getElementById('config-status');
  const statusEl = document.getElementById('status');
  const progressTextEl = document.getElementById('progress-text');
  const scrapedCountEl = document.getElementById('scraped-count');
  const progressBar = document.getElementById('progress-bar');
  const logContainer = document.getElementById('log-container');
  const downloadsSection = document.getElementById('downloads-section');
  const downloadsList = document.getElementById('downloads-list');
  const clearDownloadsBtn = document.getElementById('clear-downloads');

  let currentTabId = null;
  let scrapedData = null;
  let isScraping = false;
  let currentStatus = 'idle';
  let progressCurrent = 0;
  let progressTotal = 0;
  let totalScrapedCount = 0;
  let totalChatsCount = 0;
  let downloadedBatches = [];
  let lastStartIndex = 0;
  let currentStartIndex = 0;

  const STORAGE_KEY = 'gemini_scraper_data';
  const CONFIG_KEY = 'gemini_scraper_config';
  const BATCHES_KEY = 'gemini_scraper_batches';
  const STATE_KEY = 'gemini_scraper_state';

  const DEFAULT_CONFIG = {
    delayBetweenChats: 500,
    delayAfterClick: 3000,
    previewWaitTime: 5000,
    exportStartIndex: 0,
    exportCount: 0,
    batchDownloadCount: 2
  };

  function updateStatus(status, message = null) {
    currentStatus = status;
    const statusMap = {
      'idle': { text: '就绪', class: 'status-idle' },
      'scraping': { text: '抓取中...', class: 'status-scraping' },
      'paused': { text: '暂停下载', class: 'status-scraping' },
      'completed': { text: '完成', class: 'status-completed' },
      'error': { text: message || '错误', class: 'status-error' },
      'stopped': { text: '已停止', class: 'status-stopped' },
      'connecting': { text: '连接中...', class: 'status-scraping' }
    };

    const config = statusMap[status] || statusMap['error'];
    statusEl.textContent = config.text;
    statusEl.className = `value ${config.class}`;

    const hasData = scrapedData && scrapedData.length > 0;
    const canExport = hasData && !isScraping;

    startBtn.disabled = ['scraping', 'connecting'].includes(status);
    stopBtn.disabled = !['scraping'].includes(status);
    exportBtn.disabled = !canExport;
    exportMdBtn.disabled = !canExport;
  }

  function updateProgress(current, total) {
    const percent = total > 0 ? (current / total * 100).toFixed(1) : 0;
    progressTextEl.textContent = `${current} / ${total}`;
    scrapedCountEl.textContent = current;
    progressBar.style.width = `${percent}%`;
  }

  function addLog(message, level = 'info') {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${level}`;
    logEntry.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-message">${escapeHtml(message)}</span>
    `;

    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;

    const maxLogs = 100;
    while (logContainer.children.length > maxLogs) {
      logContainer.removeChild(logContainer.firstChild);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function sanitizeFilename(name) {
    return name.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
  }

  // 添加下载链接到列表（自动下载）
  function addDownloadToList(filename, url, chatCount, imageCount) {
    if (!downloadsSection) return;

    downloadsSection.style.display = 'block';

    const batchInfo = {
      filename: filename,
      chatCount: chatCount,
      imageCount: imageCount,
      createdAt: new Date().toISOString()
    };

    downloadedBatches.unshift(batchInfo);
    saveBatchesToStorage();

    renderBatches();

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  // 打包一批数据为ZIP并下载
  async function packageBatch(chats, startIndex) {
    if (!chats || chats.length === 0) {
      addLog('没有数据可打包', 'warn');
      return;
    }

    const chatCount = chats.length;
    let imageCount = 0;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `gemini-chats-idx${startIndex}-${chatCount}-${timestamp}.zip`;

    addLog(`正在打包 ${chatCount} 条对话...`, 'info');

    try {
      const zip = new JSZip();

      const metadata = {
        exportTime: new Date().toISOString(),
        startIndex: startIndex,
        chatCount: chatCount,
        sourceUrl: 'https://business.gemini.google.com'
      };

      const imageMapping = {};

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

                    metadata.images = metadata.images || {};
                    metadata.images[imgFilename] = {
                      originalSrc: img.src,
                      role: img.role,
                      mimeType: img.mimeType
                    };
                  }
                }
              }
            }
          }

          chatFolder.file('chat.json', JSON.stringify(chatCopy, null, 2));

          const mdContent = generateMarkdown(chatCopy);
          chatFolder.file('chat.md', mdContent);
        }
      }

      zip.file('metadata.json', JSON.stringify(metadata, null, 2));

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);

      addDownloadToList(filename, url, chatCount, imageCount);
      addLog(`批次已下载: ${filename}`, 'success');

    } catch (error) {
      addLog(`打包失败: ${error.message}`, 'error');
      throw error;
    }
  }

  // 生成Markdown内容
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

  // 手动重新下载某个批次
  async function redownloadBatch(index) {
    const batch = downloadedBatches[index];
    if (!batch) return;

    const startIdx = parseInt(batch.filename.match(/idx(\d+)-/)?.[1]) || 0;
    const count = batch.chatCount;

    addLog(`正在重新获取批次 ${index + 1} (索引 ${startIdx}, ${count}条)...`, 'info');

    try {
      const response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'startScraping',
        config: {
          delayBetweenChats: 100,
          delayAfterClick: 500,
          exportStartIndex: startIdx,
          exportCount: count,
          useRange: true
        }
      });

      if (response.success && response.chats && response.chats.length > 0) {
        await packageBatch(response.chats, startIdx);
        addLog(`重新下载完成: ${batch.filename}`, 'success');
      } else {
        addLog('无法重新获取数据（页面可能已关闭或离开）', 'warn');
        addLog(`如需保留记录，请重新打开原始聊天页面后重试`, 'info');
      }
    } catch (e) {
      if (e.message.includes('Receiving end does not exist') || !currentTabId) {
        addLog('无法连接页面，请确保Gemini页面已打开', 'error');
      } else {
        addLog(`重新下载失败: ${e.message}`, 'error');
      }
    }
  }

  // 渲染下载批次列表
  function renderBatches() {
    if (!downloadsList) return;

    downloadsList.innerHTML = '';

    downloadedBatches.forEach((batch, index) => {
      const item = document.createElement('div');
      item.className = 'download-item';
      item.innerHTML = `
        <span class="filename">${batch.filename} (${batch.chatCount}条对话, ${batch.imageCount}张图片)</span>
        <span class="batch-time">${new Date(batch.createdAt).toLocaleString()}</span>
        <button class="btn-text redownload-btn" data-index="${index}">重新下载</button>
      `;
      downloadsList.appendChild(item);
    });

    document.querySelectorAll('.redownload-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        redownloadBatch(idx);
      });
    });
  }

  // 保存批次到 storage
  async function saveBatchesToStorage() {
    try {
      await chrome.storage.local.set({ [BATCHES_KEY]: downloadedBatches });
    } catch (e) {
      console.warn('保存批次失败:', e);
    }
  }

  // 从 storage 加载批次
  async function loadBatchesFromStorage() {
    try {
      const result = await chrome.storage.local.get(BATCHES_KEY);
      if (result[BATCHES_KEY] && Array.isArray(result[BATCHES_KEY])) {
        downloadedBatches = result[BATCHES_KEY];
        renderBatches();
        if (downloadedBatches.length > 0 && downloadsSection) {
          downloadsSection.style.display = 'block';
        }
      }
    } catch (e) {
      console.warn('加载批次失败:', e);
    }
  }

  // 清除下载列表
  async function clearBatches() {
    downloadedBatches = [];
    renderBatches();
    if (downloadsSection) downloadsSection.style.display = 'none';
    try {
      await chrome.storage.local.remove(BATCHES_KEY);
      await chrome.storage.local.remove(STATE_KEY);
    } catch (e) {}
  }

  // 保存抓取状态
  async function saveScrapingState() {
    try {
      await chrome.storage.local.set({
        [STATE_KEY]: {
          lastStartIndex: lastStartIndex,
          totalScrapedCount: totalScrapedCount,
          totalChatsCount: totalChatsCount,
          savedAt: new Date().toISOString()
        }
      });
    } catch (e) {}
  }

  // 加载抓取状态
  async function loadScrapingState() {
    try {
      const result = await chrome.storage.local.get(STATE_KEY);
      if (result[STATE_KEY]) {
        const state = result[STATE_KEY];
        lastStartIndex = state.lastStartIndex || 0;
        totalScrapedCount = state.totalScrapedCount || 0;
        totalChatsCount = state.totalChatsCount || 0;
        progressCurrent = totalScrapedCount;
        updateProgress(progressCurrent, progressTotal);

        if (totalScrapedCount > 0) {
          addLog(`上次抓取到第 ${totalScrapedCount} 条，可继续从 ${lastStartIndex} 开始`, 'info');
          document.getElementById('export-start-index').value = lastStartIndex;
        }
      }
    } catch (e) {}
  }

  // 初始化
  async function init() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTabId = tab.id;

      if (!tab.url.includes('business.gemini.google')) {
        updateStatus('error', '请在Gemini Business页面使用');
        addLog('请在 Gemini Business 页面打开此扩展', 'error');
        return;
      }

      await loadConfig();
      await loadBatchesFromStorage();
      await loadScrapingState();

      updateStatus('connecting');
      addLog('正在连接...', 'info');

      await sleep(500);

      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        if (response.success) {
          addLog('Extension已连接', 'success');
          updateStatus('idle');
        }
      } catch (e) {
        addLog('Content script未响应，请刷新页面', 'warn');
        updateStatus('error', '未连接');
      }

    } catch (error) {
      addLog(`初始化失败: ${error.message}`, 'error');
    }
  }

  // 开始抓取 - 分批处理
  startBtn.addEventListener('click', async () => {
    if (isScraping) return;

    try {
      isScraping = true;
      scrapedData = null;
      totalScrapedCount = 0;
      totalChatsCount = 0;

      const config = await getConfig();
      const exportCount = parseInt(document.getElementById('export-count').value) || 0;
      const batchSize = parseInt(document.getElementById('batch-download-count').value) || 2;

      updateStatus('scraping');
      logContainer.innerHTML = '';
      addLog(`开始分批抓取，每批 ${batchSize} 条...`, 'info');

      currentStartIndex = parseInt(document.getElementById('export-start-index').value) || lastStartIndex || 0;
      let remainingCount = exportCount;
      let batchNum = 0;

      while (isScraping) {
        batchNum++;
        const thisBatchSize = (remainingCount > 0 && remainingCount < batchSize) ? remainingCount : batchSize;

        addLog(`批次 ${batchNum}: 获取 ${currentStartIndex} - ${currentStartIndex + thisBatchSize - 1}...`, 'info');

        const response = await chrome.tabs.sendMessage(currentTabId, {
          action: 'startScraping',
          config: {
            delayBetweenChats: config.delayBetweenChats,
            delayAfterClick: config.delayAfterClick,
            previewWaitTime: config.previewWaitTime,
            exportStartIndex: currentStartIndex,
            exportCount: thisBatchSize,
            useRange: true
          }
        });

        if (!response.success) {
          if (response.error && response.error.includes('超出范围')) {
            addLog('已到达列表末尾', 'info');
            break;
          }
          throw new Error(response.error || '抓取失败');
        }

        scrapedData = response.chats;
        const chatCount = scrapedData.length;

        if (chatCount === 0) {
          addLog('没有更多对话了', 'info');
          break;
        }

        addLog(`批次 ${batchNum}: 获取到 ${chatCount} 条，打包中...`, 'info');

        await packageBatch(scrapedData, currentStartIndex);

        totalScrapedCount += chatCount;
        totalChatsCount = Math.max(totalChatsCount, currentStartIndex + chatCount);
        lastStartIndex = currentStartIndex + chatCount;

        progressCurrent = totalScrapedCount;
        if (exportCount > 0) {
          progressTotal = exportCount;
        } else {
          progressTotal = totalChatsCount;
        }
        updateProgress(progressCurrent, progressTotal);

        scrapedData = null;

        if (remainingCount > 0) {
          remainingCount -= chatCount;
          if (remainingCount <= 0) break;
        }

        currentStartIndex += chatCount;

        await saveScrapingState();
        await sleep(300);

        if (currentStartIndex >= 1000) {
          addLog('已达到安全限制，停止抓取', 'warn');
          break;
        }
      }

      if (isScraping) {
        addLog(`抓取完成！共 ${totalScrapedCount} 条已打包下载`, 'success');
        updateStatus('completed');
      }

    } catch (error) {
      updateStatus('error', error.message);
      addLog(`抓取失败: ${error.message}`, 'error');
    } finally {
      isScraping = false;
    }
  });

  // 停止抓取
  stopBtn.addEventListener('click', async () => {
    if (!isScraping) return;

    try {
      addLog('正在停止...', 'warn');
      await chrome.tabs.sendMessage(currentTabId, { action: 'stopScraping' });
      isScraping = false;
      updateStatus('stopped');
      lastStartIndex = currentStartIndex;
      await saveScrapingState();
      addLog(`抓取已停止，已处理 ${totalScrapedCount} 条，可继续从 ${lastStartIndex} 开始`, 'warn');
    } catch (error) {
      addLog(`停止失败: ${error.message}`, 'error');
    }
  });

  // 清空数据
  clearBtn.addEventListener('click', async () => {
    try {
      await clearData();
      await clearBatches();
      scrapedData = null;
      progressCurrent = 0;
      progressTotal = 0;
      totalScrapedCount = 0;
      totalChatsCount = 0;
      lastStartIndex = 0;
      updateProgress(0, 0);
      updateStatus('idle');
      addLog('数据已清空', 'info');
      logContainer.innerHTML = '';
      addLog('准备就绪', 'info');
    } catch (error) {
      addLog(`清空失败: ${error.message}`, 'error');
    }
  });

  // 清空下载列表
  if (clearDownloadsBtn) {
    clearDownloadsBtn.addEventListener('click', async () => {
      await clearBatches();
      addLog('下载列表已清空', 'info');
    });
  }

  // 导出数据 - 导出所有批次汇总
  exportBtn.addEventListener('click', async () => {
    if (downloadedBatches.length === 0 && (!scrapedData || scrapedData.length === 0)) {
      addLog('没有可导出的数据', 'warn');
      return;
    }

    try {
      const allChats = [];
      let exportedCount = 0;
      let failedBatches = [];

      if (downloadedBatches.length > 0) {
        addLog(`正在重新获取 ${downloadedBatches.length} 个批次的数据...`, 'info');

        for (let i = 0; i < downloadedBatches.length; i++) {
          const batch = downloadedBatches[i];
          const startIdx = parseInt(batch.filename.match(/idx(\d+)-/)?.[1]) || 0;
          const count = batch.chatCount;

          addLog(`获取批次 ${i + 1}/${downloadedBatches.length}: 索引 ${startIdx}...`, 'info');

          try {
            const response = await chrome.tabs.sendMessage(currentTabId, {
              action: 'startScraping',
              config: {
                delayBetweenChats: 100,
                delayAfterClick: 500,
                exportStartIndex: startIdx,
                exportCount: count,
                useRange: true
              }
            });

            if (response.success && response.chats) {
              for (const chat of response.chats) {
                chat._batchIndex = exportedCount + 1;
                allChats.push(chat);
              }
              exportedCount += response.chats.length;
            } else {
              failedBatches.push(i + 1);
            }
          } catch (e) {
            failedBatches.push(i + 1);
            addLog(`批次 ${i + 1} 获取失败: ${e.message}`, 'error');
          }

          await sleep(200);
        }
      } else if (scrapedData && scrapedData.length > 0) {
        allChats.push(...scrapedData);
        exportedCount = scrapedData.length;
      }

      if (allChats.length === 0) {
        addLog('未能获取到任何数据', 'warn');
        return;
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `gemini-all-chats-${timestamp}-${allChats.length}.json`;

      const exportData = {
        exportTime: new Date().toISOString(),
        totalChats: allChats.length,
        totalBatches: downloadedBatches.length,
        failedBatches: failedBatches,
        sourceUrl: 'https://business.gemini.google.com',
        chats: allChats
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      let msg = `已导出: ${filename} (${allChats.length}条对话`;
      if (failedBatches.length > 0) {
        msg += `, ${failedBatches.length}个批次失败`;
      }
      msg += ')';
      addLog(msg, 'success');

    } catch (error) {
      addLog(`导出失败: ${error.message}`, 'error');
    }
  });

  // 导出Markdown - 导出所有批次汇总
  exportMdBtn.addEventListener('click', async () => {
    if (downloadedBatches.length === 0 && (!scrapedData || scrapedData.length === 0)) {
      addLog('没有可导出的数据', 'warn');
      return;
    }

    try {
      const allChats = [];
      let exportedCount = 0;
      let failedBatches = [];

      if (downloadedBatches.length > 0) {
        addLog(`正在重新获取 ${downloadedBatches.length} 个批次的数据...`, 'info');

        for (let i = 0; i < downloadedBatches.length; i++) {
          const batch = downloadedBatches[i];
          const startIdx = parseInt(batch.filename.match(/idx(\d+)-/)?.[1]) || 0;
          const count = batch.chatCount;

          addLog(`获取批次 ${i + 1}/${downloadedBatches.length}: 索引 ${startIdx}...`, 'info');

          try {
            const response = await chrome.tabs.sendMessage(currentTabId, {
              action: 'startScraping',
              config: {
                delayBetweenChats: 100,
                delayAfterClick: 500,
                exportStartIndex: startIdx,
                exportCount: count,
                useRange: true
              }
            });

            if (response.success && response.chats) {
              for (const chat of response.chats) {
                chat._batchIndex = exportedCount + 1;
                allChats.push(chat);
              }
              exportedCount += response.chats.length;
            } else {
              failedBatches.push(i + 1);
            }
          } catch (e) {
            failedBatches.push(i + 1);
            addLog(`批次 ${i + 1} 获取失败: ${e.message}`, 'error');
          }

          await sleep(200);
        }
      } else if (scrapedData && scrapedData.length > 0) {
        allChats.push(...scrapedData);
        exportedCount = scrapedData.length;
      }

      if (allChats.length === 0) {
        addLog('未能获取到任何数据', 'warn');
        return;
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `gemini-all-chats-${timestamp}-${allChats.length}.md`;

      let mdContent = `# Gemini Chats Export\n\n`;
      mdContent += `Export Time: ${new Date().toISOString()}\n`;
      mdContent += `Total Chats: ${allChats.length}\n`;
      mdContent += `Total Batches: ${downloadedBatches.length}\n`;
      if (failedBatches.length > 0) {
        mdContent += `Failed Batches: ${failedBatches.join(', ')}\n`;
      }
      mdContent += `\n---\n\n`;

      for (let i = 0; i < allChats.length; i++) {
        const chat = allChats[i];
        mdContent += `## Chat ${i + 1}: ${chat.title || 'Untitled'}\n\n`;
        mdContent += `*Scraped at: ${chat.timestamp || 'unknown'}*\n\n`;
        mdContent += `---\n\n`;

        for (const msg of chat.messages || []) {
          const role = msg.role === 'user' ? '👤 User' : '🤖 Gemini';
          mdContent += `### ${role}\n\n`;
          if (msg.text) mdContent += `${msg.text}\n\n`;
          mdContent += `---\n\n`;
        }

        mdContent += `\n\n`;
      }

      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog(`已导出: ${filename} (${allChats.length}条对话)`, 'success');

    } catch (error) {
      addLog(`Markdown导出失败: ${error.message}`, 'error');
    }
  });

  // 清空日志
  clearLogsBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('日志已清空', 'info');
  });

  // 监听消息
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender.tab || sender.tab.id !== currentTabId) return;

    if (message.type === 'progress') {
      progressCurrent = message.current;
      progressTotal = message.total;
      updateProgress(message.current, message.total);
    }

    if (message.type === 'log') {
      addLog(message.message, message.level);
    }
  });

  // 保存数据
  async function saveData() {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: {
          scrapedData,
          currentStatus,
          isScraping,
          progressCurrent,
          progressTotal,
          savedAt: new Date().toISOString()
        }
      });
    } catch (e) {}
  }

  // 加载数据
  async function loadData() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result[STORAGE_KEY]) {
        const saved = result[STORAGE_KEY];
        if (saved.scrapedData && saved.scrapedData.length > 0) {
          scrapedData = saved.scrapedData;
          progressCurrent = saved.progressCurrent || 0;
          progressTotal = saved.progressTotal || 0;
          updateProgress(progressCurrent, progressTotal);
          updateStatus('completed');
          addLog(`已加载之前保存的数据 (${scrapedData.length} 个对话)`, 'info');
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // 清除数据
  async function clearData() {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (e) {}
  }

  // 加载配置
  async function loadConfig() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY);
      const config = result[CONFIG_KEY] || DEFAULT_CONFIG;
      document.getElementById('delay-between-chats').value = config.delayBetweenChats;
      document.getElementById('delay-after-click').value = config.delayAfterClick;
      document.getElementById('preview-wait-time').value = config.previewWaitTime || 5000;
      document.getElementById('export-start-index').value = config.exportStartIndex || 0;
      document.getElementById('export-count').value = config.exportCount || 0;
      document.getElementById('batch-download-count').value = config.batchDownloadCount || 2;
    } catch (e) {}
  }

  // 保存配置
  async function saveConfig() {
    const delayBetweenChats = parseInt(document.getElementById('delay-between-chats').value) || 500;
    const delayAfterClick = parseInt(document.getElementById('delay-after-click').value) || 3000;
    const previewWaitTime = parseInt(document.getElementById('preview-wait-time').value) || 5000;
    const exportStartIndex = parseInt(document.getElementById('export-start-index').value) || 0;
    const exportCount = parseInt(document.getElementById('export-count').value) || 0;
    const batchDownloadCount = parseInt(document.getElementById('batch-download-count').value) || 2;

    const config = {
      delayBetweenChats,
      delayAfterClick,
      previewWaitTime,
      exportStartIndex,
      exportCount,
      batchDownloadCount
    };

    try {
      await chrome.storage.local.set({ [CONFIG_KEY]: config });
      configStatusEl.textContent = '已保存';
      setTimeout(() => configStatusEl.textContent = '', 2000);
      return config;
    } catch (e) {
      return null;
    }
  }

  // 获取配置
  async function getConfig() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY);
      return result[CONFIG_KEY] || DEFAULT_CONFIG;
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }

  // 配置保存按钮
  saveConfigBtn.addEventListener('click', async () => {
    const config = await saveConfig();
    if (config) {
      addLog(`配置已保存`, 'success');
    }
  });

  init();

})();
