# Gemini Business 聊天记录抓取工具 - 实现计划

## 项目概述
开发一个Chrome/Firefox扩展，用于抓取Gemini Business的历史聊天记录，第一阶段实现基础文本内容抓取功能。

## 技术选型
- **Manifest版本**: V3 (Chrome完美支持，Firefox逐步完善)
- **架构模式**: Content Script + Service Worker + Popup
- **API选择**: 使用`chrome.tabs.sendMessage`进行消息传递
- **DOM操作**: MutationObserver监听动态内容
- **状态管理**: Chrome Storage API
- **日志系统**: 自定义Logger类 + console.log

## 文件结构
```
chrome-extension/
├── manifest.json              # 扩展配置文件
├── background.js              # Service Worker (可选，用于后台任务)
├── content.js                 # 核心抓取逻辑
├── popup/
│   ├── popup.html            # UI界面
│   ├── popup.css             # 样式文件
│   └── popup.js              # UI逻辑
└── icons/                     # 扩展图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 第一阶段实现详细方案

### 1. manifest.json 配置

**关键配置项**:
```json
{
  "manifest_version": 3,
  "name": "Gemini Chat Scraper",
  "version": "1.0.0",
  "description": "抓取Gemini Business聊天记录",
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "tabs"
  ],
  "host_permissions": [
    "https://business.gemini.google/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://business.gemini.google/*"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

---

### 2. content.js 核心抓取逻辑

#### 2.1 DOM选择与初始化

```javascript
// 检测页面是否是Gemini Business
function isGeminiPage() {
  return window.location.hostname === 'business.gemini.google';
}

// 等待对话列表容器加载
async function waitForChatList() {
  return await waitForElement('.conversation-list.more-visible', 10000);
}
```

#### 2.2 展开所有对话

```javascript
// 点击"展开"按钮
async function expandAllChats() {
  // 查找展开按钮（可能的选择器）
  const expandButtons = document.querySelectorAll(
    'button[aria-label*="more"], button[aria-label*="展开"], .expand-button'
  );

  for (const button of expandButtons) {
    if (button.offsetParent !== null) {
      button.click();
      await sleep(500); // 等待内容加载
    }
  }
}
```

#### 2.3 抓取对话列表

```javascript
// 获取所有对话项
function getChatItems() {
  const chatItems = document.querySelectorAll(
    '.conversation-list.more-visible .chat-item'
  );
  return Array.from(chatItems);
}

// 提取对话信息
function extractChatInfo(chatElement) {
  return {
    title: chatElement.querySelector('.chat-title')?.textContent?.trim(),
    timestamp: chatElement.querySelector('.chat-time')?.textContent?.trim(),
    element: chatElement
  };
}
```

#### 2.4 点击对话并抓取内容

```javascript
// 点击单个对话
async function clickChat(chatElement) {
  chatElement.click();
  await sleep(1000); // 等待内容加载

  // 等待content区域加载
  await waitForElement('.content', 5000);
}

// 提取消息内容
function extractMessages() {
  const messages = [];
  const messageElements = document.querySelectorAll('.content .message');

  messageElements.forEach(msgEl => {
    messages.push({
      role: msgEl.classList.contains('user') ? 'user' : 'ai',
      content: msgEl.textContent?.trim()
    });
  });

  return messages;
}
```

#### 2.5 主抓取流程

```javascript
class ChatScraper {
  constructor() {
    this.chats = [];
    this.currentChatIndex = 0;
    this.isRunning = false;
    this.logger = new Logger({ level: 'info' });
  }

  async startScraping() {
    this.isRunning = true;
    this.chats = [];
    this.logger.info('开始抓取聊天记录...');

    try {
      // 1. 等待页面加载
      await waitForChatList();

      // 2. 展开所有对话
      await expandAllChats();
      this.logger.info('已展开所有对话');

      // 3. 获取对话列表
      const chatItems = getChatItems();
      this.logger.info(`发现 ${chatItems.length} 个对话`);

      // 4. 遍历每个对话
      for (let i = 0; i < chatItems.length; i++) {
        if (!this.isRunning) break;

        this.currentChatIndex = i;
        await this.scrapeSingleChat(chatItems[i], i + 1, chatItems.length);

        // 更新进度
        await updateProgress(i + 1, chatItems.length, this.chats);
      }

      this.logger.info(`抓取完成，共抓取 ${this.chats.length} 个对话`);
      return { success: true, chats: this.chats };

    } catch (error) {
      this.logger.error('抓取失败:', error);
      return { success: false, error: error.message, chats: this.chats };
    }
  }

  async scrapeSingleChat(chatElement, currentIndex, total) {
    try {
      // 提取对话基本信息
      const chatInfo = extractChatInfo(chatElement);

      // 点击对话
      await clickChat(chatElement);

      // 提取消息内容
      const messages = extractMessages();

      // 保存数据
      this.chats.push({
        index: currentIndex,
        title: chatInfo.title,
        timestamp: chatInfo.timestamp,
        messages: messages
      });

      this.logger.info(`[${currentIndex}/${total}] ${chatInfo.title} - ${messages.length} 条消息`);

    } catch (error) {
      this.logger.error(`抓取对话 ${currentIndex} 失败:`, error);
      throw error;
    }
  }

  stopScraping() {
    this.isRunning = false;
    this.logger.info('停止抓取');
  }
}
```

---

### 3. popup UI界面

#### 3.1 popup.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Gemini Chat Scraper</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <h1>📊 Gemini 聊天记录抓取工具</h1>

    <div class="status-section">
      <div class="status-item">
        <span class="label">状态:</span>
        <span id="status" class="value">就绪</span>
      </div>
      <div class="status-item">
        <span class="label">进度:</span>
        <span id="progress-text" class="value">0/0</span>
      </div>
      <div class="status-item">
        <span class="label">抓取数:</span>
        <span id="scraped-count" class="value">0</span>
      </div>
    </div>

    <div class="progress-bar-container">
      <div id="progress-bar" class="progress-bar"></div>
    </div>

    <div class="controls">
      <button id="start-btn" class="btn btn-primary">开始抓取</button>
      <button id="stop-btn" class="btn btn-danger" disabled>停止抓取</button>
      <button id="export-btn" class="btn btn-success" disabled>导出结果</button>
    </div>

    <div class="logs">
      <h3>📝 日志</h3>
      <div id="log-container" class="log-container"></div>
    </div>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

#### 3.2 popup.css

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 400px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5;
}

.container {
  padding: 20px;
}

h1 {
  font-size: 18px;
  margin-bottom: 20px;
  color: #333;
}

.status-section {
  background: white;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.status-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.label {
  color: #666;
  font-weight: 500;
}

.value {
  color: #333;
  font-weight: 600;
}

.progress-bar-container {
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 15px;
}

.progress-bar {
  height: 100%;
  background: #4CAF50;
  width: 0%;
  transition: width 0.3s ease;
}

.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.btn {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #2196F3;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1976D2;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background: #d32f2f;
}

.btn-success {
  background: #4CAF50;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #388E3C;
}

.logs {
  background: white;
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.logs h3 {
  font-size: 14px;
  margin-bottom: 10px;
  color: #333;
}

.log-container {
  max-height: 200px;
  overflow-y: auto;
  background: #f8f8f8;
  padding: 10px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
}

.log-entry {
  margin-bottom: 4px;
  padding: 4px;
  border-radius: 2px;
}

.log-entry.info {
  color: #333;
}

.log-entry.error {
  color: #f44336;
  background: #ffebee;
}

.log-entry.success {
  color: #4CAF50;
  background: #e8f5e9;
}
```

#### 3.3 popup.js

```javascript
// DOM 元素
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const exportBtn = document.getElementById('export-btn');
const statusEl = document.getElementById('status');
const progressTextEl = document.getElementById('progress-text');
const scrapedCountEl = document.getElementById('scraped-count');
const progressBar = document.getElementById('progress-bar');
const logContainer = document.getElementById('log-container');

let currentTabId = null;
let scrapedData = null;

// 初始化
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  addLog('扩展已加载，准备就绪', 'info');
}

// 开始抓取
startBtn.addEventListener('click', async () => {
  try {
    // 更新UI状态
    updateUIState('scraping');
    addLog('开始抓取...', 'info');

    // 发送消息到content script
    const response = await chrome.tabs.sendMessage(currentTabId, {
      action: 'startScraping'
    });

    if (response.success) {
      scrapedData = response.chats;
      updateUIState('completed');
      addLog(`抓取完成！共抓取 ${response.chats.length} 个对话`, 'success');
    } else {
      throw new Error(response.error);
    }

  } catch (error) {
    updateUIState('error');
    addLog(`抓取失败: ${error.message}`, 'error');
    console.error(error);
  }
});

// 停止抓取
stopBtn.addEventListener('click', async () => {
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      action: 'stopScraping'
    });
    updateUIState('stopped');
    addLog('已停止抓取', 'info');
  } catch (error) {
    addLog(`停止失败: ${error.message}`, 'error');
  }
});

// 导出结果
exportBtn.addEventListener('click', () => {
  if (scrapedData) {
    exportToFile(scrapedData);
  }
});

// 监听来自content script的进度更新
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.tab && sender.tab.id === currentTabId) {
    if (message.type === 'progress') {
      updateProgress(message.current, message.total, message.chats);
    }
    if (message.type === 'log') {
      addLog(message.message, message.level);
    }
  }
});

// 更新进度
function updateProgress(current, total, chats) {
  const percent = total > 0 ? (current / total * 100).toFixed(1) : 0;
  progressTextEl.textContent = `${current}/${total}`;
  scrapedCountEl.textContent = current;
  progressBar.style.width = `${percent}%`;

  if (chats) {
    scrapedData = chats;
  }
}

// 更新UI状态
function updateUIState(state) {
  switch(state) {
    case 'idle':
      statusEl.textContent = '就绪';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      exportBtn.disabled = true;
      break;
    case 'scraping':
      statusEl.textContent = '抓取中...';
      startBtn.disabled = true;
      stopBtn.disabled = false;
      exportBtn.disabled = true;
      break;
    case 'completed':
      statusEl.textContent = '完成';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      exportBtn.disabled = false;
      break;
    case 'stopped':
      statusEl.textContent = '已停止';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      exportBtn.disabled = false;
      break;
    case 'error':
      statusEl.textContent = '错误';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      exportBtn.disabled = scrapedData !== null;
      break;
  }
}

// 添加日志
function addLog(message, level = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${level}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 导出到文件
function exportToFile(data) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `gemini-chats-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
  addLog('已导出到文件', 'success');
}

// 监听storage变化（同步进度）
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.scrapeProgress) {
    const progress = changes.scrapeProgress.newValue;
    updateProgress(progress.current, progress.total, progress.chats);
  }
});

// 启动
init();
```

---

### 4. 辅助工具函数

```javascript
// 工具函数集合

// 等待指定时间
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 等待元素出现
async function waitForElement(selector, timeout = 10000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = document.querySelector(selector);
    if (element && element.offsetParent !== null) {
      return element;
    }
    await sleep(100);
  }

  throw new Error(`元素 ${selector} 未在 ${timeout}ms 内找到`);
}

// Logger 类
class Logger {
  constructor(options = {}) {
    this.level = options.level || 'info';
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(level, ...args) {
    if (this.levels[level] <= this.levels[this.level]) {
      console[level]('[GeminiScraper]', ...args);
    }
  }

  error(...args) { this.log('error', ...args); }
  warn(...args) { this.log('warn', ...args); }
  info(...args) { this.log('info', ...args); }
  debug(...args) { this.log('debug', ...args); }
}

// 状态管理
class StateManager {
  constructor() {
    this.STATE_KEY = 'scrapeProgress';
  }

  async updateState(partialState) {
    const currentState = await this.getState();
    const newState = { ...currentState, ...partialState };
    await chrome.storage.local.set({ [this.STATE_KEY]: newState });
    return newState;
  }

  async getState() {
    const result = await chrome.storage.local.get(this.STATE_KEY);
    return result[this.STATE_KEY] || { current: 0, total: 0, chats: [] };
  }
}

// 发送进度到popup
async function sendProgress(current, total, chats) {
  await chrome.runtime.sendMessage({
    type: 'progress',
    current,
    total,
    chats
  });
}

// 发送日志到popup
async function sendLog(message, level = 'info') {
  await chrome.runtime.sendMessage({
    type: 'log',
    message,
    level
  });
}
```

---

### 5. Chrome Extension 安装说明

#### Chrome 浏览器安装步骤

1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `chrome-extension` 文件夹
5. 扩展安装完成，在扩展管理页面可以看到
6. 访问 `https://business.gemini.google/` 页面
7. 点击浏览器工具栏的扩展图标，打开popup界面
8. 点击"开始抓取"按钮开始抓取

#### Firefox 浏览器安装步骤

1. 打开Firefox浏览器，访问 `about:debugging#/runtime/this-firefox`
2. 点击"临时载入附加组件"
3. 选择 `chrome-extension/manifest.json` 文件
4. 临时加载完成（注意：Firefox对Manifest V3的支持可能有限）
5. 访问 `https://business.gemini.google/` 页面
6. 点击工具栏的扩展图标使用

#### 注意事项

- 第一次安装可能需要手动刷新Gemini页面
- 如果遇到权限问题，检查manifest.json中的host_permissions配置
- 查看浏览器控制台（F12）查看详细的调试日志

---

### 6. 测试验证方案

#### 6.1 功能测试清单

- [ ] 扩展能否正常加载
- [ ] 能否正确识别Gemini Business页面
- [ ] 能否找到 `.conversation-list.more-visible` 容器
- [ ] 能否点击"展开"按钮
- [ ] 能否遍历所有对话
- [ ] 能否点击单个对话
- [ ] 能否等待 `.content` 区域加载
- [ ] 能否提取消息文本
- [ ] 进度显示是否正确
- [ ] 日志输出是否清晰

#### 6.2 验证方式

1. **控制台日志**: 在Gemini页面按F12打开控制台，查看抓取日志
2. **Popup界面**: 实时查看抓取进度和状态
3. **导出文件**: 查看导出的JSON文件，检查数据完整性
4. **手动对比**: 对比抓取结果与页面实际内容

#### 6.3 调试技巧

- 使用 `console.log()` 输出关键变量
- 使用 `debugger` 断点调试
- 检查DOM结构: `document.querySelector('.conversation-list.more-visible')`
- 查看网络请求: Network面板
- 监控存储变化: Application > Local Storage

---

### 7. 可能遇到的问题及解决方案

| 问题 | 可能原因 | 解决方案 |
|------|---------|----------|
| 找不到对话列表容器 | DOM选择器错误 | 使用浏览器检查工具查看实际class名称 |
| 点击对话后内容未加载 | 等待时间不足 | 增加sleep时间或使用MutationObserver等待 |
| 抓取中途停止 | 页面刷新或网络中断 | 添加错误处理和重试机制 |
| 扩展无法通信 | 权限问题 | 检查manifest.json的permissions配置 |
| 导出文件失败 | Blob创建失败 | 检查数据格式和大小 |

---

### 8. 后续扩展计划（第二阶段）

1. **图片抓取**: 识别并下载消息中的图片
2. **视频抓取**: 识别并下载视频文件
3. **Markdown导出**: 将抓取内容格式化为Markdown
4. **Web Viewer**: 创建独立的HTML查看器
5. **Firefox优化**: 适配Firefox的Manifest V3支持
6. **增量更新**: 支持只抓取新增对话

---

## 总结

本计划详细描述了第一阶段（基础文本抓取）的完整实现方案，包括：

✅ 完整的技术架构设计
✅ 详细的代码实现方案
✅ 清晰的文件结构
✅ 实用的安装说明
✅ 完整的测试验证方案
✅ 常见问题解决方案

**下一步**: 等待用户确认后，开始实现所有代码文件。

---

## 附录：实现确认清单

在开始编码前，请确认以下关键决策：

- [ ] **验证方式**: 主要通过控制台日志查看抓取结果
- [ ] **导出格式**: 第一阶段先导出JSON格式，便于调试
- [ ] **错误处理**: 遇到失败时自动跳过继续抓取，支持重试3次
- [ ] **进度更新**: 每个对话都实时更新进度
- [ ] **DOM选择器**: 使用提供的 `.conversation-list.more-visible` 和 `.content` 选择器
- [ ] **浏览器兼容**: 优先支持Chrome，Firefox作为次要目标
- [ ] **超时设置**: 每个对话加载30秒超时
