/**
 * Gemini Chat Scraper - Popup Script
 */

(function() {
  'use strict';

  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const exportBtn = document.getElementById('export-btn');
  const clearLogsBtn = document.getElementById('clear-logs');
  const statusEl = document.getElementById('status');
  const progressTextEl = document.getElementById('progress-text');
  const scrapedCountEl = document.getElementById('scraped-count');
  const progressBar = document.getElementById('progress-bar');
  const logContainer = document.getElementById('log-container');

  let currentTabId = null;
  let scrapedData = null;
  let isScraping = false;
  let currentStatus = 'idle';
  let progressCurrent = 0;
  let progressTotal = 0;

  const STORAGE_KEY = 'gemini_scraper_data';

  function updateStatus(status, message = null) {
    currentStatus = status;
    const statusMap = {
      'idle': { text: '就绪', class: 'status-idle' },
      'scraping': { text: '抓取中...', class: 'status-scraping' },
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

      updateStatus('connecting');
      addLog('正在连接...', 'info');

      // 等待content script加载
      await sleep(500);

      // 尝试ping content script并获取当前状态
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        if (response.success) {
          addLog('Extension已连接', 'success');

          // 检查当前抓取状态
          if (response.isScraping) {
            isScraping = true;
            updateStatus('scraping');
            addLog('抓取进行中...', 'info');
          } else {
            // 尝试加载之前保存的数据
            const hasSavedData = await loadData();
            if (!hasSavedData) {
              updateStatus('idle');
            }
          }
        }
      } catch (e) {
        addLog('Content script未响应，请刷新页面', 'warn');
        addLog('提示: 确保页面完全加载后重试', 'info');
        updateStatus('error', '未连接');
      }

    } catch (error) {
      addLog(`初始化失败: ${error.message}`, 'error');
    }
  }

  // 开始抓取
  startBtn.addEventListener('click', async () => {
    if (isScraping) return;

    try {
      isScraping = true;
      scrapedData = null;
      await clearData(); // 清除旧数据
      updateStatus('scraping');
      addLog('开始抓取...', 'info');

      logContainer.innerHTML = '';
      addLog('正在连接页面...', 'info');

      const response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'startScraping'
      });

      if (response.success) {
        scrapedData = response.chats;
        progressCurrent = response.total;
        progressTotal = response.total;
        await saveData(); // 保存数据
        isScraping = false;
        updateStatus('completed');
        updateProgress(response.total, response.total);
        addLog(`✓ 抓取完成！共 ${response.total} 个对话`, 'success');
      } else {
        throw new Error(response.error || '抓取失败');
      }

    } catch (error) {
      updateStatus('error', error.message);
      addLog(`抓取失败: ${error.message}`, 'error');

      if (error.chats && error.chats.length > 0) {
        scrapedData = error.chats;
        await saveData();
        exportBtn.disabled = false;
        addLog(`已保存 ${error.chats.length} 个对话`, 'warn');
      }

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
      addLog('抓取已停止', 'warn');

      if (scrapedData && scrapedData.length > 0) {
        await saveData();
      }

    } catch (error) {
      addLog(`停止失败: ${error.message}`, 'error');
    }
  });

  // 导出数据
  exportBtn.addEventListener('click', () => {
    if (!scrapedData || scrapedData.length === 0) {
      addLog('没有可导出的数据', 'warn');
      return;
    }

    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `gemini-chats-${timestamp}-${scrapedData.length}.json`;

      const exportData = {
        exportTime: new Date().toISOString(),
        totalChats: scrapedData.length,
        sourceUrl: 'https://gemini.google.com',
        chats: scrapedData
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

      addLog(`已导出: ${filename}`, 'success');
      clearData(); // 导出后清除存储的数据
      scrapedData = null;
      updateStatus('idle');

    } catch (error) {
      addLog(`导出失败: ${error.message}`, 'error');
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
      if (message.chats) {
        scrapedData = message.chats;
        saveData();
      }
    }

    if (message.type === 'log') {
      addLog(message.message, message.level);
    }
  });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 保存数据到存储
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
    } catch (e) {
      console.warn('保存数据失败:', e);
    }
  }

  // 从存储加载数据
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
    } catch (e) {
      console.warn('加载数据失败:', e);
    }
    return false;
  }

  // 清除存储的数据
  async function clearData() {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (e) {}
  }

  init();

})();
