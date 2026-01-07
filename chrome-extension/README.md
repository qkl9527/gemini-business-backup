# Gemini Chat Scraper - Chrome Extension

Chrome扩展，用于抓取Gemini Business的历史聊天记录。

## 功能特性

### 第一阶段（当前版本）
- ✅ 抓取对话列表
- ✅ 提取文本消息内容
- ✅ 实时进度显示
- ✅ 日志记录
- ✅ JSON格式导出
- ✅ 支持Chrome和Firefox

### 后续计划
- 图片抓取与下载
- 视频抓取与下载
- Markdown格式导出
- Web Viewer查看器

## 安装说明

### Chrome 浏览器

1. **打开扩展管理页面**
   - 在浏览器地址栏输入 `chrome://extensions/`
   - 或点击菜单 → 更多工具 → 扩展程序

2. **启用开发者模式**
   - 右上角切换"开发者模式"为开启状态

3. **加载扩展**
   - 点击左上角"加载已解压的扩展程序"
   - 选择 `chrome-extension` 文件夹

4. **验证安装**
   - 扩展图标应出现在工具栏
   - 访问 `https://business.gemini.google/`
   - 点击扩展图标打开控制面板

### Firefox 浏览器

1. **打开调试页面**
   - 地址栏输入 `about:debugging#/runtime/this-firefox`

2. **临时加载扩展**
   - 点击"临时载入附加组件"
   - 选择 `chrome-extension/manifest.json` 文件

3. **使用扩展**
   - 访问 `https://business.gemini.google/`
   - 点击工具栏扩展图标

> ⚠️ Firefox对Manifest V3的支持仍在发展中，部分功能可能受限

## 使用方法

### 基本使用

1. **登录Gemini**
   - 确保已登录 Gemini Business 账号
   - 访问 `https://business.gemini.google/`

2. **打开扩展**
   - 点击浏览器工具栏的扩展图标
   - 弹出控制面板

3. **开始抓取**
   - 点击"开始抓取"按钮
   - 等待抓取完成（请勿切换页面）

4. **导出结果**
   - 点击"导出 JSON"按钮
   - 保存抓取的数据

### 验证与调试

**查看详细日志**
- 打开浏览器控制台 (F12)
- 在Console标签页查看 `[GeminiScraper]` 前缀的日志

**DOM结构检查**
- 在Gemini页面控制台运行：
  ```javascript
  geminiScraperChecker.runAll()
  ```
- 或运行单个检查：
  ```javascript
  geminiScraperChecker.checkChatList()  // 检查对话列表
  geminiScraperChecker.checkContentArea() // 检查内容区域
  ```

**导出检查结果**
- 在控制台运行：
  ```javascript
  const results = geminiScraperChecker.exportResults()
  ```
- 复制输出的JSON数据，用于反馈问题

## 文件结构

```
chrome-extension/
├── manifest.json           # 扩展配置
├── content.js              # 核心抓取逻辑
├── dom-checker.js          # DOM检查工具（调试用）
├── popup/
│   ├── popup.html         # UI界面
│   ├── popup.css          # 样式文件
│   └── popup.js           # UI逻辑
└── icons/
    ├── icon16.svg         # 16x16 图标
    ├── icon48.svg         # 48x48 图标
    ├── icon128.svg        # 128x128 图标
    └── README.md          # 图标说明
```

## 导出数据格式

导出的JSON文件包含以下结构：

```json
{
  "exportTime": "2024-01-07T10:30:00.000Z",
  "totalChats": 10,
  "sourceUrl": "https://business.gemini.google",
  "chats": [
    {
      "index": 1,
      "title": "对话标题",
      "timestamp": "2024-01-07T10:30:00.000Z",
      "messages": [
        {
          "role": "user",
          "content": "用户消息内容",
          "index": 1
        },
        {
          "role": "ai",
          "content": "AI回复内容",
          "index": 2
        }
      ],
      "messageCount": 2
    }
  ]
}
```

## 常见问题

### Q: 扩展无法连接到页面
**A:**
1. 刷新Gemini页面
2. 确保在正确的URL（business.gemini.google）
3. 检查扩展是否已启用

### Q: 找不到对话列表
**A:**
1. 登录Gemini账号
2. 确保左侧有历史对话列表
3. 在控制台运行 `geminiScraperChecker.checkChatList()` 检查

### Q: 抓取内容不完整
**A:**
1. 检查是否有"展开"按钮需要点击
2. 等待页面完全加载
3. 查看控制台日志确认错误信息

### Q: 如何报告问题
**A:**
1. 在Gemini页面控制台运行 `geminiScraperChecker.exportResults()`
2. 复制输出结果
3. 提供以下信息：
   - 截图或HTML片段
   - 导出的JSON结果
   - 浏览器版本
   - 操作系统

## 开发说明

### 本地修改

1. 修改代码后，在 `chrome://extensions/` 页面
2. 点击扩展卡片上的"刷新"按钮
3. 或先移除扩展，重新加载

### 测试流程

1. 访问Gemini页面
2. 打开扩展popup
3. 点击"开始抓取"
4. 观察进度和日志
5. 导出并验证数据

### 调试技巧

- 使用 `console.log()` 在content.js中添加调试信息
- 使用 `debugger` 设置断点
- 查看Network面板监控请求
- 使用Elements面板检查DOM结构

## 浏览器兼容性

| 浏览器 | 支持版本 | 备注 |
|--------|----------|------|
| Chrome | 88+ | 完美支持 |
| Firefox | 109+ | 部分功能受限 |
| Edge | 88+ | 与Chrome相同 |
| Brave | 基于Chromium | 与Chrome相同 |

## 权限说明

本扩展申请以下权限：

- `activeTab` - 访问当前标签页
- `scripting` - 注入脚本
- `storage` - 本地存储
- `tabs` - 标签页管理
- `host_permissions` - business.gemini.google

所有权限仅用于抓取用户明确访问的页面数据。

## 更新日志

### v1.0.0 (2024-01-07)
- 初始版本
- 基础文本抓取功能
- JSON导出
- 进度显示
- 日志记录

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！
