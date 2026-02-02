# Gemini 聊天记录抓取器

强大的浏览器扩展，用于备份和分析您的 Gemini Business 聊天历史。

[english](README.md) | [中文](README_CN.md)

## 🌟 功能特性

### 当前版本 (v1.0.0)
- ✅ **对话列表抓取** - 自动获取所有历史对话
- ✅ **文本内容提取** - 完整捕获用户和 AI 的消息内容
- ✅ **实时进度显示** - 显示抓取进度的实时更新
- ✅ **详细日志记录** - 提供全面的调试和监控日志
- ✅ **JSON 格式导出** - 清晰的结构化数据导出
- ✅ **跨浏览器支持** - 支持 Chrome、Firefox、Edge 和 Brave

### 计划功能
- 📷 图片抓取和下载
- 🎥 视频抓取和下载
- 📝 Markdown 格式导出
- 🔍 Web 查看器用于浏览导出数据

## 🚀 快速开始

### 安装 (Chrome/Edge/Brave)
1. 打开扩展页面：`chrome://extensions/`
2. 启用右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择 `chrome-extension` 文件夹
5. 访问 `https://business.gemini.google/` 并点击扩展图标

### 安装 (Firefox)
1. 打开调试页面：`about:debugging#/runtime/this-firefox`
2. 点击 **"临时载入附加组件"**
3. 选择 `firefox-extension/manifest.json` 文件
4. 访问 `https://business.gemini.google/` 并使用扩展

### 基本使用
1. **登录**您的 Gemini Business 账号
2. **打开**浏览器工具栏中的扩展弹窗
3. **点击**"开始抓取"并等待完成
4. **导出**您的数据，使用"导出 JSON"按钮

## 📊 数据格式

扩展将您的聊天数据导出为结构化的 JSON 格式：

```json
{
  "exportTime": "2024-01-07T10:30:00.000Z",
  "totalChats": 10,
  "sourceUrl": "https://business.gemini.google",
  "chats": [
    {
      "index": 1,
      "title": "示例对话",
      "timestamp": "2024-01-07T10:30:00.000Z",
      "messages": [
        {
          "role": "user",
          "content": "用户消息内容",
          "index": 1
        },
        {
          "role": "ai", 
          "content": "AI 回复内容",
          "index": 2
        }
      ],
      "messageCount": 2
    }
  ]
}
```

## 🛠️ 项目结构

```
gemini-chat-scraper/
├── chrome-extension/          # Chrome 扩展构建
│   ├── manifest.json         # 扩展配置
│   ├── content.js            # 核心抓取逻辑
│   ├── background.js         # 后台服务工作进程
│   ├── dom-checker.js        # DOM 调试工具
│   ├── jszip.min.js          # ZIP 库
│   ├── popup/               # 扩展 UI 界面
│   │   ├── popup.html      # 主弹窗界面
│   │   ├── popup.css       # 样式文件
│   │   └── popup.js        # UI 逻辑
│   └── icons/               # 扩展图标
├── firefox-extension/        # Firefox 专用构建
│   ├── manifest.json        # Firefox 清单文件
│   ├── content.js          # 共享内容脚本
│   ├── background.js       # Firefox 后台脚本
│   └── popup/              # 共享弹窗 UI
└── md/                     # 文档目录
    ├── spec.md             # 技术规范
    ├── implementation-plan.md
    └── gemini_content.md
```

## 🔧 故障排除

### 常见问题

**扩展无法连接到页面：**
1. 刷新 Gemini 页面
2. 确保您在正确的 URL (`business.gemini.google`)
3. 检查扩展是否已启用

**找不到对话列表：**
1. 确保已登录您的 Gemini 账号
2. 验证左侧边栏是否有历史对话
3. 在控制台运行：`geminiScraperChecker.checkChatList()`

**内容抓取不完整：**
1. 检查是否有点击"展开"按钮
2. 等待页面完全加载
3. 检查控制台是否有错误消息

### 调试工具

**运行诊断脚本：**
1. 在 Gemini 页面按 `F12` 打开开发者控制台
2. 运行：`geminiScraperChecker.runAll()`
3. 导出结果：`geminiScraperChecker.exportResults()`

**检查单个元素：**
```javascript
geminiScraperChecker.checkChatList()      // 检查对话列表
geminiScraperChecker.checkContentArea()   // 检查内容区域
```

## 🌐 浏览器兼容性

| 浏览器 | 最低版本 | 状态 | 说明 |
|---------|----------------|--------|-------|
| Chrome  | 88+            | ✅ 完全支持 | 推荐 |
| Firefox | 109+           | ⚠️ 部分支持 | Manifest V3 限制 |
| Edge    | 88+            | ✅ 完全支持 | 同 Chrome |
| Brave   | 最新版         | ✅ 完全支持 | 基于 Chromium |

## 🔒 隐私与安全

此扩展仅访问：
- `https://*.business.gemini.google/*` 域名的内容
- 本地存储用于临时数据
- 用户明确激活时的当前标签页

**不会向外部服务器发送任何数据** - 所有处理都在您的浏览器本地进行。

## 📋 所需权限

- `activeTab` - 用户点击扩展时访问当前标签页
- `scripting` - 注入内容脚本进行数据提取
- `storage` - 本地存储临时数据
- `tabs` - 导航和管理标签页
- `host_permissions` - 仅限于 business.gemini.google 域名

## 🔄 开发

### 修改代码
1. 在相应扩展文件夹中修改源文件
2. 在 `chrome://extensions/` 或 Firefox 调试页面重新加载扩展
3. 在 Gemini 页面测试更改

### 测试流程
1. 访问 Gemini Business 页面
2. 打开扩展弹窗
3. 开始抓取过程
4. 监控进度和日志
5. 导出并验证数据完整性

## 📝 更新日志

### v1.0.0 (2024-01-07)
- 初始发布
- 基础文本抓取功能
- JSON 导出功能
- 进度跟踪系统
- 全面的日志记录
- 跨浏览器支持

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支
3. 进行更改
4. 在 Chrome 和 Firefox 上充分测试
5. 提交详细描述的 Pull Request

## 📄 许可证

MIT 许可证 - 详见 LICENSE 文件。

## 🆘 技术支持

- 📋 查看上面的故障排除部分
- 🔧 运行 DOM 检查器诊断工具
- 📸 提供截图和错误消息
- 🐛 向仓库提交问题并附详细信息

---

**⚡ 专业提示：** 定期导出您的聊天历史以备份重要对话！