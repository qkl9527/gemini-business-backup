/**
 * Gemini Chat Scraper - Popup Script
 * 支持分批抓取，每批打包下载，使用分片传输解决64MB限制
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
  let exportCount = 0;
  let emptyBatchCount = 0;
  let pendingBatchResolve = null;
  let isWaitingForTransfer = false;

  const STORAGE_KEY = 'gemini_scraper_data';
  const CONFIG_KEY = 'gemini_scraper_config';
  const BATCHES_KEY = 'gemini_scraper_batches';
  const STATE_KEY = 'gemini_scraper_state';

  const DEFAULT_CONFIG = {
    delayBetweenChats: 500,
    delayAfterClick: 3000,
    exportStartIndex: 0,
    exportCount: 0,
    batchDownloadCount: 2,
    chunkSize: 4
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

  function addDownloadToList(filename, url, chatCount, imageCount) {
    console.log('[Download] addDownloadToList called:', filename);

    const batchInfo = {
      filename: filename,
      chatCount: chatCount,
      imageCount: imageCount,
      createdAt: new Date().toISOString()
    };

    downloadedBatches.unshift(batchInfo);
    saveBatchesToStorage();

    if (downloadsSection) {
      downloadsSection.style.display = 'block';
    }

    if (downloadsList) {
      const item = document.createElement('div');
      item.className = 'download-item';
      item.innerHTML = `
        <span class="filename">${filename} (${chatCount}条对话, ${imageCount}张图片)</span>
        <span class="batch-time">${new Date().toLocaleString()}</span>
      `;
      downloadsList.insertBefore(item, downloadsList.firstChild);
    }

    if (url) {
      console.log('[Download] Triggering download:', filename);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

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
        await sendToPackageAndTransfer(response.chats, startIdx);
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

  let pendingTransferResolve = null;

  const transferSessions = {};

  function waitForBatchComplete(timeoutMs = 300000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingBatchResolve = null;
        reject(new Error('批次等待超时'));
      }, timeoutMs);
      pendingBatchResolve = () => {
        clearTimeout(timeout);
        pendingBatchResolve = null;
        resolve();
      };
    });
  }

  function waitForTransfer(timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingTransferResolve = null;
        reject(new Error('传输超时'));
      }, timeoutMs);
      pendingTransferResolve = () => {
        clearTimeout(timeout);
        pendingTransferResolve = null;
        resolve();
      };
    });
  }

  function handleTransferStart(request) {
    const { transferId, metadata } = request;
    console.log(`[Popup] transfer-start: ${transferId}, file: ${metadata.filename}`);

    transferSessions[transferId] = {
      metadata: metadata,
      chunks: [],
      receivedChunks: 0,
      totalChunks: 0,
      startTime: Date.now()
    };
  }

  function handleChunk(request) {
    const { transferId, chunkIndex, totalChunks, data, isLast } = request;
    console.log(`[Popup] chunk: ${chunkIndex}/${totalChunks}`);

    const session = transferSessions[transferId];

    if (!session) {
      console.warn(`[Popup] Session not found: ${transferId}`);
      return;
    }

    session.chunks[chunkIndex] = new Uint8Array(data);
    session.receivedChunks++;
    session.totalChunks = totalChunks;
  }

  async function handleTransferEnd(request) {
    const { transferId } = request;
    console.log(`[Popup] transfer-end: ${transferId}`);

    const session = transferSessions[transferId];

    if (!session) {
      console.warn(`[Popup] Session not found: ${transferId}`);
      if (pendingTransferResolve) {
        pendingTransferResolve();
        pendingTransferResolve = null;
      }
      return;
    }

    try {
      console.log(`[Popup] Merging ${session.receivedChunks} chunks...`);

      let totalSize = 0;
      for (const chunk of session.chunks) {
        if (chunk) totalSize += chunk.length;
      }

      if (totalSize === 0) {
        console.warn('[Popup] No data to merge');
        delete transferSessions[transferId];
        if (pendingTransferResolve) {
          pendingTransferResolve();
          pendingTransferResolve = null;
        }
        return;
      }

      const buffer = new Uint8Array(totalSize);
      let offset = 0;

      for (let i = 0; i < session.chunks.length; i++) {
        const chunk = session.chunks[i];
        if (chunk) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
      }

      const elapsed = Date.now() - session.startTime;
      console.log(`[Popup] Merge complete: ${totalSize} bytes, ${elapsed}ms`);

      const blob = new Blob([buffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);

      const filename = session.metadata.filename;
      const chatCount = session.metadata.chatCount;
      const imageCount = session.metadata.imageCount;

      console.log(`[Popup] Calling addDownloadToList: ${filename}`);
      addDownloadToList(filename, url, chatCount, imageCount);

      delete transferSessions[transferId];

      if (pendingTransferResolve) {
        console.log('[Popup] Resolving transfer promise');
        pendingTransferResolve();
        pendingTransferResolve = null;
      }

    } catch (error) {
      console.error('[Popup] Merge error:', error);
      addLog(`合并失败: ${error.message}`, 'error');
      delete transferSessions[transferId];
      if (pendingTransferResolve) {
        pendingTransferResolve();
        pendingTransferResolve = null;
      }
    }
  }

  function handleChunk(request) {
    const { transferId, chunkIndex, totalChunks, data, isLast } = request;
    const session = transferSessions[transferId];

    if (!session) {
      console.warn(`[Popup] 未找到传输会话: ${transferId}`);
      return;
    }

    session.chunks[chunkIndex] = new Uint8Array(data);
    session.receivedChunks++;
    session.totalChunks = totalChunks;

    if (chunkIndex % 10 === 0) {
      addLog(`接收分片: ${chunkIndex + 1}/${totalChunks}`, 'debug');
    }
  }

  async function handleTransferEnd(request) {
    const { transferId } = request;
    const session = transferSessions[transferId];

    if (!session) {
      console.warn(`[Popup] 未找到传输会话: ${transferId}`);
      if (pendingTransferResolve) {
        pendingTransferResolve();
      }
      return;
    }

    try {
      addLog(`合并 ${session.receivedChunks} 个分片...`, 'info');

      let totalSize = 0;
      for (const chunk of session.chunks) {
        if (chunk) totalSize += chunk.length;
      }

      if (totalSize === 0) {
        console.warn('[Popup] No data to merge');
        delete transferSessions[transferId];
        if (pendingTransferResolve) {
          pendingTransferResolve();
        }
        return;
      }

      const buffer = new Uint8Array(totalSize);
      let offset = 0;

      for (let i = 0; i < session.chunks.length; i++) {
        const chunk = session.chunks[i];
        if (chunk) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
      }

      const elapsed = Date.now() - session.startTime;
      addLog(`合并完成: ${totalSize} bytes, 耗时: ${elapsed}ms`, 'info');

      const blob = new Blob([buffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);

      const filename = session.metadata.filename;
      const chatCount = session.metadata.chatCount;
      const imageCount = session.metadata.imageCount;

      console.log('[Popup] Calling addDownloadToList:', filename);
      addDownloadToList(filename, url, chatCount, imageCount);

      delete transferSessions[transferId];

      if (pendingTransferResolve) {
        pendingTransferResolve();
      }

    } catch (error) {
      console.error('[Popup] Merge error:', error);
      addLog(`合并失败: ${error.message}`, 'error');
      delete transferSessions[transferId];
      if (pendingTransferResolve) {
        pendingTransferResolve();
      }
    }
  }

  async function sendToPackageAndTransfer(chats, startIndex) {
    if (!chats || chats.length === 0) {
      console.log('[Popup] No chats to transfer');
      return;
    }

    const config = await getConfig();
    const chunkSizeMB = config.chunkSize || 4;

    console.log('[Popup] sendToPackageAndTransfer:', chats.length, 'chats, chunkSize:', chunkSizeMB, 'MB');
    addLog(`正在打包并传输 ${chats.length} 个对话... (分片: ${chunkSizeMB}MB)`, 'info');

    try {
      await chrome.tabs.sendMessage(currentTabId, {
        action: 'packageAndTransfer',
        chats: chats,
        startIndex: startIndex,
        chunkSize: chunkSizeMB * 1024 * 1024
      });

      console.log('[Popup] packageAndTransfer command sent, waiting for transfer...');
      addLog('等待传输完成...', 'info');

      await waitForTransfer(60000);
      console.log('[Popup] Transfer completed successfully');

    } catch (e) {
      console.log('[Popup] Transfer error caught:', e.message);
      if (e.message === '传输超时') {
        addLog('传输超时，继续下一批', 'warn');
      } else {
        addLog(`传输请求失败: ${e.message}`, 'error');
      }
      clearTimeout(pendingTransferResolve?.[Symbol.toStringTag]);
      pendingTransferResolve = null;
    }
  }

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

  async function saveBatchesToStorage() {
    try {
      await chrome.storage.local.set({ [BATCHES_KEY]: downloadedBatches });
    } catch (e) {
      console.warn('保存批次失败:', e);
    }
  }

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

  async function clearBatches() {
    downloadedBatches = [];
    renderBatches();
    if (downloadsSection) downloadsSection.style.display = 'none';
    try {
      await chrome.storage.local.remove(BATCHES_KEY);
      await chrome.storage.local.remove(STATE_KEY);
    } catch (e) {}
  }

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

  startBtn.addEventListener('click', async () => {
    if (isScraping) return;

    try {
      isScraping = true;
      scrapedData = null;
      totalScrapedCount = 0;
      totalChatsCount = 0;

      const config = await getConfig();
      exportCount = parseInt(document.getElementById('export-count').value) || 0;
      const batchSize = parseInt(document.getElementById('batch-download-count').value) || 2;

      updateStatus('scraping');
      logContainer.innerHTML = '';
      addLog(`开始分批抓取，每批 ${batchSize} 条...`, 'info');

      currentStartIndex = parseInt(document.getElementById('export-start-index').value) || lastStartIndex || 0;
      let remainingCount = exportCount;
      let batchNum = 0;
      let emptyBatchCount = 0;
      const maxEmptyBatches = 2;

      while (isScraping) {
        batchNum++;
        const thisBatchSize = (remainingCount > 0 && remainingCount < batchSize) ? remainingCount : batchSize;

        addLog(`批次 ${batchNum}: 获取 ${currentStartIndex} - ${currentStartIndex + thisBatchSize - 1}...`, 'info');

        isWaitingForTransfer = false;

        try {
          await chrome.tabs.sendMessage(currentTabId, {
            action: 'startScraping',
            config: {
              delayBetweenChats: config.delayBetweenChats,
              delayAfterClick: config.delayAfterClick,
              exportStartIndex: currentStartIndex,
              exportCount: thisBatchSize,
              useRange: true,
              chunkSize: config.chunkSize,
              batchNumber: batchNum
            }
          });
        } catch (e) {
          if (e.message.includes('Receiving end does not exist')) {
            addLog('Content script 未响应，请刷新页面', 'error');
            break;
          }
        }

        if (!isScraping) break;

        try {
          await waitForBatchComplete(300000);
        } catch (e) {
          addLog(`批次 ${batchNum} 等待超时`, 'warn');
        }

        if (!isScraping) break;

        if (isWaitingForTransfer) {
          addLog(`等待ZIP下载完成...`, 'info');
          try {
            await waitForTransfer(120000);
          } catch (e) {
            addLog(`ZIP传输超时`, 'warn');
          }
        }

        await saveScrapingState();

        if (currentStartIndex >= 1000) {
          addLog('已达到安全限制，停止抓取', 'warn');
          break;
        }

        if (remainingCount > 0) {
          remainingCount -= thisBatchSize;
          if (remainingCount <= 0) break;
        }
      }

      isScraping = false;
      addLog(`抓取完成！共 ${totalScrapedCount} 条`, 'success');
      updateStatus('completed');

    } catch (error) {
      isScraping = false;
      updateStatus('error', error.message);
      addLog(`抓取失败: ${error.message}`, 'error');
    }
  });

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

  if (clearDownloadsBtn) {
    clearDownloadsBtn.addEventListener('click', async () => {
      await clearBatches();
      addLog('下载列表已清空', 'info');
    });
  }

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

  clearLogsBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('日志已清空', 'info');
  });

  chrome.runtime.onMessage.addListener((message, sender) => {
    console.log('[Popup] Received message:', message.type, message);

    if (message.type === 'transfer-start') {
      console.log('[Popup] transfer-start received');
      handleTransferStart(message);
      return;
    }

    if (message.type === 'chunk') {
      console.log('[Popup] chunk received:', message.chunkIndex, '/', message.totalChunks);
      handleChunk(message);
      return;
    }

    if (message.type === 'transfer-end') {
      console.log('[Popup] transfer-end received');
      handleTransferEnd(message);
      return;
    }

    if (message.type === 'transfer-complete') {
      addLog(`分片传输完成: ${message.filename}`, 'success');
      addDownloadToList(message.filename, message.url, message.chatCount, message.imageCount);
      if (pendingTransferResolve) {
        pendingTransferResolve();
      }
      return;
    }

    if (message.type === 'batch-complete') {
      console.log('[Popup] batch-complete received:', JSON.stringify({
        batchNumber: message.batchNumber,
        chatCount: message.chatCount,
        startIndex: message.startIndex,
        totalChats: message.totalChats
      }));
      addLog(`批次 ${message.batchNumber} 抓取完成: ${message.chatCount} 条对话`, 'info');

      if (message.chatCount === 0) {
        emptyBatchCount++;
        if (emptyBatchCount >= 2) {
          addLog(`连续2个批次为空，已到达列表末尾`, 'info');
          isScraping = false;
        }
      } else {
        emptyBatchCount = 0;
        totalScrapedCount += message.chatCount;
        lastStartIndex = message.startIndex + message.chatCount;
        currentStartIndex = lastStartIndex;

        progressCurrent = totalScrapedCount;

        if (exportCount > 0) {
          progressTotal = exportCount;
        } else if (message.totalChats) {
          progressTotal = message.totalChats;
        } else {
          progressTotal = totalScrapedCount;
        }
        updateProgress(progressCurrent, progressTotal);

        addLog(`等待ZIP传输完成...`, 'info');
        isWaitingForTransfer = true;
      }

      if (pendingBatchResolve) {
        pendingBatchResolve();
        pendingBatchResolve = null;
      }
      return;
    }

    if (message.type === 'transfer-complete') {
      console.log('[Popup] transfer-complete received');
      addLog(`ZIP传输完成: ${message.filename}`, 'success');
      addDownloadToList(message.filename, message.url, message.chatCount, message.imageCount);
      isWaitingForTransfer = false;
      if (pendingTransferResolve) {
        pendingTransferResolve();
        pendingTransferResolve = null;
      }
      return;
    }

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

  async function clearData() {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (e) {}
  }

  async function loadConfig() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY);
      const config = result[CONFIG_KEY] || DEFAULT_CONFIG;
      document.getElementById('delay-between-chats').value = config.delayBetweenChats;
      document.getElementById('delay-after-click').value = config.delayAfterClick;
      document.getElementById('export-start-index').value = config.exportStartIndex || 0;
      document.getElementById('export-count').value = config.exportCount || 0;
      document.getElementById('batch-download-count').value = config.batchDownloadCount || 2;
      document.getElementById('chunk-size').value = config.chunkSize || 4;
    } catch (e) {}
  }

  async function saveConfig() {
    const delayBetweenChats = parseInt(document.getElementById('delay-between-chats').value) || 500;
    const delayAfterClick = parseInt(document.getElementById('delay-after-click').value) || 3000;
    const exportStartIndex = parseInt(document.getElementById('export-start-index').value) || 0;
    const exportCount = parseInt(document.getElementById('export-count').value) || 0;
    const batchDownloadCount = parseInt(document.getElementById('batch-download-count').value) || 2;
    const chunkSize = parseInt(document.getElementById('chunk-size').value) || 4;

    const config = {
      delayBetweenChats,
      delayAfterClick,
      exportStartIndex,
      exportCount,
      batchDownloadCount,
      chunkSize
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

  async function getConfig() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY);
      return result[CONFIG_KEY] || DEFAULT_CONFIG;
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }

  saveConfigBtn.addEventListener('click', async () => {
    const config = await saveConfig();
    if (config) {
      addLog(`配置已保存`, 'success');
    }
  });

  init();

})();
