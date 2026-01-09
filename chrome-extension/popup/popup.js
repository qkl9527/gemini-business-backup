/**
 * Gemini Chat Scraper - Popup Script
 */

(function() {
  'use strict';

  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const exportBtn = document.getElementById('export-btn');
  const exportZipBtn = document.getElementById('export-zip-btn');
  const exportMdBtn = document.getElementById('export-md-btn');
  const clearLogsBtn = document.getElementById('clear-logs');
  const saveConfigBtn = document.getElementById('save-config');
  const configStatusEl = document.getElementById('config-status');
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
  let imageProgressCurrent = 0;
  let imageProgressTotal = 0;

  const STORAGE_KEY = 'gemini_scraper_data';
  const CONFIG_KEY = 'gemini_scraper_config';

  const DEFAULT_CONFIG = {
    delayBetweenChats: 500,
    delayAfterClick: 3000
  };

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
    exportZipBtn.disabled = !canExport;
    exportMdBtn.disabled = !canExport;
  }

  function updateProgress(current, total) {
    const percent = total > 0 ? (current / total * 100).toFixed(1) : 0;
    progressTextEl.textContent = `${current} / ${total}`;
    scrapedCountEl.textContent = current;
    progressBar.style.width = `${percent}%`;
  }

  function showImageProgress(show) {
    const container = document.getElementById('image-progress-container');
    if (container) {
      container.style.display = show ? 'block' : 'none';
    }
  }

  function updateImageProgress(current, total) {
    const container = document.getElementById('image-progress-container');
    if (container) {
      const percent = total > 0 ? (current / total * 100).toFixed(1) : 0;
      const textEl = document.getElementById('image-progress-text');
      const barEl = document.getElementById('image-progress-bar');
      if (textEl) textEl.textContent = `${current} / ${total}`;
      if (barEl) barEl.style.width = `${percent}%`;
    }
    imageProgressCurrent = current;
    imageProgressTotal = total;
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

      // 加载配置
      await loadConfig();

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

      // 获取配置
      const config = await getConfig();

      const response = await chrome.tabs.sendMessage(currentTabId, {
        action: 'startScraping',
        config: config
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
      clearData();
      scrapedData = null;
      updateStatus('idle');

    } catch (error) {
      addLog(`导出失败: ${error.message}`, 'error');
    }
  });

  // HTML转Markdown（基础转换）
  function htmlToMarkdown(html) {
    if (!html) return '';

    const temp = document.createElement('div');
    temp.innerHTML = html;

    let text = temp.innerHTML;

    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

    text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

    text = text.replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n');

    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    text = text.replace(/<[^>]+>/g, '');

    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');

    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  // 导出Markdown
  exportMdBtn.addEventListener('click', () => {
    if (!scrapedData || scrapedData.length === 0) {
      addLog('没有可导出的数据', 'warn');
      return;
    }

    try {
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `gemini-chats-${timestamp}-${scrapedData.length}.md`;

      let mdContent = `# Gemini Chats Export\n\n`;
      mdContent += `Export Time: ${new Date().toISOString()}\n`;
      mdContent += `Total Chats: ${scrapedData.length}\n\n`;
      mdContent += `---\n\n`;

      for (let i = 0; i < scrapedData.length; i++) {
        const chat = scrapedData[i];
        mdContent += `## Chat ${i + 1}: ${chat.title || 'Untitled'}\n\n`;
        mdContent += `*Scraped at: ${chat.timestamp || 'unknown'}*\n\n`;
        mdContent += `---\n\n`;

        for (const msg of chat.messages || []) {
          const role = msg.role === 'user' ? '👤 User' : '🤖 Gemini';
          mdContent += `### ${role}\n\n`;

          if (msg.text) {
            const markdown = htmlToMarkdown(msg.text);
            mdContent += `${markdown}\n\n`;
          }

          if (msg.images && msg.images.length > 0) {
            for (const img of msg.images) {
              if (img.type === 'image') {
                mdContent += `![Image](${img.src || img.localPath || 'image'})\n\n`;
              }
            }
          }

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

      addLog(`已导出: ${filename}`, 'success');

    } catch (error) {
      addLog(`Markdown导出失败: ${error.message}`, 'error');
      console.error(error);
    }
  });

  // 导出ZIP（含图片）
  exportZipBtn.addEventListener('click', async () => {
    if (!scrapedData || scrapedData.length === 0) {
      addLog('没有可导出的数据', 'warn');
      return;
    }

    if (typeof JSZip === 'undefined') {
      addLog('JSZip库未加载', 'error');
      return;
    }

    try {
      addLog('正在收集图片URL...', 'info');

      const imageUrls = [];
      for (const chat of scrapedData) {
        for (const msg of chat.messages || []) {
          if (msg.images && msg.images.length > 0) {
            for (const img of msg.images) {
              if (img.src && (img.src.startsWith('blob:') || img.src.startsWith('data:'))) {
                imageUrls.push({
                  src: img.src,
                  role: img.role
                });
              }
            }
          }
        }
      }

      if (imageUrls.length === 0) {
        addLog('没有找到图片', 'warn');
        return;
      }

      addLog(`找到 ${imageUrls.length} 张图片，正在下载...`, 'info');

      showImageProgress(true);
      updateImageProgress(0, imageUrls.length);

      const zip = new JSZip();
      const imagesFolder = zip.folder('images');
      const chatsFolder = zip.folder('chats');

      const srcToLocalPath = {};

      // 图片数据已嵌入在scrapedData中，直接使用
      let imageData = {};
      let fetchCount = 0;
      let totalImages = 0;

      for (const chat of scrapedData) {
        for (const msg of chat.messages || []) {
          if (msg.images && msg.images.length > 0) {
            for (const img of msg.images) {
              if (img.data && img.data.length > 0) {
                totalImages++;
                if (!srcToLocalPath[img.src]) {
                  const mimeType = img.mimeType || 'image/png';
                  const ext = mimeType.split('/')[1]?.split(';')[0] || 'png';
                  const localPath = `images/image_${Date.now()}_${fetchCount}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
                  imageData[localPath] = {
                    data: img.data,
                    mimeType: mimeType,
                    originalSrc: img.src
                  };
                  srcToLocalPath[img.src] = localPath;
                  fetchCount++;
                }
              }
            }
          }
        }
      }

      addLog(`图片数据已内嵌: ${fetchCount} 张`, 'info');
      updateImageProgress(fetchCount, totalImages);

      for (const [localPath, data] of Object.entries(imageData)) {
        try {
          imagesFolder.file(localPath, new Uint8Array(data.data));
          addLog(`添加图片: ${localPath}`, 'debug');
        } catch (e) {
          addLog(`添加图片失败 ${localPath}: ${e.message}`, 'error');
        }
      }

      if (fetchCount === 0) {
        addLog('警告: 没有可导出的图片', 'warn');
      } else {
        addLog(`已处理 ${fetchCount} 张图片`, 'success');
      }

      if (currentTabId) {
        try {
          addLog('发送fetchImages请求到content script...', 'info');
          const response = await chrome.tabs.sendMessage(currentTabId, {
            action: 'fetchImages',
            images: imageUrls
          });

          addLog(`响应: success=${response?.success}, count=${response?.count}, failed=${response?.failed}`, 'info');

          if (response && response.success && response.images) {
            imageData = response.images;
            fetchCount = Object.keys(imageData).length;
            updateImageProgress(fetchCount, imageUrls.length);

            addLog(`开始添加 ${fetchCount} 张图片到ZIP...`, 'info');
            for (const [localPath, data] of Object.entries(imageData)) {
              try {
                if (!data || !data.data) {
                  addLog(`跳过无效数据: ${localPath}`, 'warn');
                  continue;
                }
                imagesFolder.file(localPath, new Uint8Array(data.data));
                addLog(`✓ 添加图片: ${localPath}`, 'debug');
              } catch (e) {
                addLog(`添加图片失败 ${localPath}: ${e.message}`, 'error');
              }
            }

            if (fetchCount === 0) {
              addLog('警告: 没有成功获取任何图片', 'warn');
            } else {
              addLog(`已获取 ${fetchCount} 张图片`, 'success');
            }
          } else {
            addLog(`获取图片失败: ${response?.error || response ? '返回数据为空' : '无响应'}`, 'error');
          }
        } catch (e) {
          addLog(`请求图片失败: ${e.message}`, 'error');
          addLog('可能原因: content script未加载或页面已刷新', 'info');
        }
      }

      showImageProgress(false);
      addLog('正在生成ZIP文件...', 'info');

      // 处理chat数据，将图片URL替换为localPath
      for (let i = 0; i < scrapedData.length; i++) {
        const chat = JSON.parse(JSON.stringify(scrapedData[i]));
        const updatedMessages = [];

        for (const msg of chat.messages || []) {
          const updatedMsg = { ...msg };

          if (msg.images && msg.images.length > 0) {
            updatedMsg.images = [];

            for (const img of msg.images) {
              if (img.src && (img.src.startsWith('blob:') || img.src.startsWith('data:'))) {
                const localPath = srcToLocalPath[img.src];
                if (localPath) {
                  updatedMsg.images.push({
                    type: 'image',
                    localPath: localPath,
                    originalRole: img.role
                  });
                } else {
                  updatedMsg.images.push(img);
                }
              } else {
                updatedMsg.images.push(img);
              }
            }
          }

          updatedMessages.push(updatedMsg);
        }

        chat.messages = updatedMessages;
        chatsFolder.file(`chat_${i + 1}_${sanitizeFilename(chat.title || 'untitled')}.json`, JSON.stringify(chat, null, 2));
      }

      const metadata = {
        exportTime: new Date().toISOString(),
        totalChats: scrapedData.length,
        totalImages: Object.keys(imageData).length,
        sourceUrl: 'https://business.gemini.google.com',
        note: '图片保存在images文件夹，JSON中的localPath字段指向对应图片'
      };

      zip.file('metadata.json', JSON.stringify(metadata, null, 2));

      const content = await zip.generateAsync({ type: 'blob' });
      const timestamp = new Date().toISOString().slice(0, 10);
      const imageCount = Object.keys(imageData).length;
      const filename = `gemini-chats-${timestamp}-${scrapedData.length}-images-${imageCount}.zip`;

      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addLog(`已导出: ${filename} (${scrapedData.length}个对话, ${imageCount}张图片)`, 'success');
      clearData();
      scrapedData = null;
      updateStatus('idle');

    } catch (error) {
      addLog(`ZIP导出失败: ${error.message}`, 'error');
      console.error(error);
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

  function sanitizeFilename(name) {
    return name.replace(/[\/\\:*?"<>|]/g, '_').substring(0, 50);
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

  // 加载配置
  async function loadConfig() {
    try {
      const result = await chrome.storage.local.get(CONFIG_KEY);
      const config = result[CONFIG_KEY] || DEFAULT_CONFIG;
      document.getElementById('delay-between-chats').value = config.delayBetweenChats;
      document.getElementById('delay-after-click').value = config.delayAfterClick;
    } catch (e) {
      console.warn('加载配置失败:', e);
    }
  }

  // 保存配置
  async function saveConfig() {
    const delayBetweenChats = parseInt(document.getElementById('delay-between-chats').value) || 500;
    const delayAfterClick = parseInt(document.getElementById('delay-after-click').value) || 3000;

    const config = {
      delayBetweenChats,
      delayAfterClick
    };

    try {
      await chrome.storage.local.set({ [CONFIG_KEY]: config });
      configStatusEl.textContent = '已保存';
      setTimeout(() => configStatusEl.textContent = '', 2000);
      return config;
    } catch (e) {
      console.warn('保存配置失败:', e);
      return null;
    }
  }

  // 获取当前配置
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
      addLog(`配置已保存: 间隔 ${config.delayBetweenChats}ms, 等待 ${config.delayAfterClick}ms`, 'success');
    }
  });

  init();

})();
