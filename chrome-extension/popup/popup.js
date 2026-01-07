/**
 * Gemini Chat Scraper - Popup Script
 * 第一阶段：基础文本抓取
 */

(function() {
  'use strict';

  // DOM 元素
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const exportBtn = document.getElementById('export-btn');
  const clearLogsBtn = document.getElementById('clear-logs');
  const statusEl = document.getElementById('status');
  const progressTextEl = document.getElementById('progress-text');
  const scrapedCountEl = document.getElementById('scraped-count');
  const progressBar = document.getElementById('progress-bar');
  const logContainer = document.getElementById('log-container');

  // 状态
  let currentTabId = null;
  let scrapedData = null;
  let isScraping = false;

  // 初始化
  async function init() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      currentTabId = tab.id;

      // 检查是否是Gemini页面
      if (!tab.url.includes('business.gemini.google')) {
        updateStatus('error');
        addLog('请在 Gemini 页面使用此扩展', 'error');
        disableAllButtons();
        return;
      }

      // 验证content script是否已加载
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        if (response.success) {
          addLog('Extension已连接，准备就绪', 'success');
          updateStatus('idle');
        }
      } catch (e) {
        addLog('请刷新Gemini页面后重试', 'warn');
      }

    } catch (error) {
      addLog(`初始化失败: ${error.message}`, 'error');
      console.error(error);
    }
  }

  // 更新状态显示
  function updateStatus(status, message = null) {
    const statusMap = {
      'idle': { text: '就绪', class: 'status-idle' },
      'scraping': { text: '抓取中...', class: 'status-scraping' },
      'completed': { text: '完成', class: 'status-completed' },
      'error': { text: message || '错误', class: 'status-error' },
      'stopped': { text: '已停止', class: 'status-stopped' }
    };

    const config = statusMap[status] || statusMap['error'];
    statusEl.textContent = config.text;
    statusEl.className = `value ${config.class}`;

    // 更新按钮状态
    startBtn.disabled = ['scraping'].includes(status);
    stopBtn.disabled = !['scraping'].includes(status);
    exportBtn.disabled = !['completed', 'stopped'].includes(status) || !scrapedData;
  }

  // 更新进度
  function updateProgress(current, total) {
    const percent = total > 0 ? (current / total * 100).toFixed(1) : 0;
    progressTextEl.textContent = `${current} / ${total}`;
    scrapedCountEl.textContent = current;
    progressBar.style.width = `${percent}%`;
  }

  // 添加日志
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

    // 限制日志数量
    const maxLogs = 100;
    while (logContainer.children.length > maxLogs) {
      logContainer.removeChild(logContainer.firstChild);
    }
  }

  // HTML转义
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 禁用所有按钮
  function disableAllButtons() {
    startBtn.disabled = true;
    stopBtn.disabled = true;
    exportBtn.disabled = true;
  }

  // 开始抓取
  startBtn.addEventListener('click', async () => {
    if (isScraping) return;

    try {
      isScraping = true;
      scrapedData = null;
      updateStatus('scraping');
      addLog('开始抓取聊天记录...', 'info');

      // 清空之前的日志
      logContainer.innerHTML = '';
      addLog('正在连接页面...', 'info');

      // 发送开始抓取消息
      const response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'startScraping'
      });

      if (response.success) {
        scrapedData = response.chats;
        updateStatus('completed');
        updateProgress(response.total, response.total);
        addLog(`✓ 抓取完成！共 ${response.total} 个对话`, 'success');

        // 自动启用导出按钮
        setTimeout(() => {
          exportBtn.disabled = false;
        }, 500);

      } else {
        throw new Error(response.error || '抓取失败');
      }

    } catch (error) {
      updateStatus('error', error.message);
      addLog(`抓取失败: ${error.message}`, 'error');
      console.error('抓取错误:', error);

      // 如果有部分数据，启用导出
      if (error.chats && error.chats.length > 0) {
        scrapedData = error.chats;
        exportBtn.disabled = false;
        addLog(`已保存 ${error.chats.length} 个对话的数据`, 'warn');
      }

    } finally {
      isScraping = false;
    }
  });

  // 停止抓取
  stopBtn.addEventListener('click', async () => {
    if (!isScraping) return;

    try {
      addLog('正在停止抓取...', 'warn');
      await chrome.tabs.sendMessage(currentTabId, { action: 'stopScraping' });
      isScraping = false;
      updateStatus('stopped');
      addLog('抓取已停止', 'warn');

      // 如果有数据，启用导出
      if (scrapedData && scrapedData.length > 0) {
        exportBtn.disabled = false;
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
      const filename = `gemini-chats-${timestamp}-${scrapedData.length}-records.json`;

      const exportData = {
        exportTime: new Date().toISOString(),
        totalChats: scrapedData.length,
        sourceUrl: 'https://business.gemini.google',
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
      addLog(`文件大小: ${(jsonString.length / 1024).toFixed(2)} KB`, 'info');

    } catch (error) {
      addLog(`导出失败: ${error.message}`, 'error');
    }
  });

  // 清空日志
  clearLogsBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
    addLog('日志已清空', 'info');
  });

  // 监听来自content script的消息
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!sender.tab || sender.tab.id !== currentTabId) return;

    if (message.type === 'progress') {
      updateProgress(message.current, message.total);
      if (message.chats) {
        scrapedData = message.chats;
      }
    }

    if (message.type === 'log') {
      addLog(message.message, message.level);
    }
  });

  // 监听storage变化（备用方案）
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.scrapeProgress) {
      const progress = changes.scrapeProgress.newValue;
      if (progress) {
        updateProgress(progress.current, progress.total);
        if (progress.chats) {
          scrapedData = progress.chats;
        }
      }
    }
  });

  // 启动
  init();

})();
