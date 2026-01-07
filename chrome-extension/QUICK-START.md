# 🚀 快速入门指南

## 5分钟开始使用

### 步骤1：安装扩展 ⏱️ 1分钟

1. 打开Chrome浏览器，访问：
   ```
   chrome://extensions/
   ```

2. 开启右上角的 **"开发者模式"**

3. 点击 **"加载已解压的扩展程序"**

4. 选择 `chrome-extension` 文件夹

5. ✅ 扩展安装成功！

### 步骤2：打开Gemini ⏱️ 1分钟

1. 新标签页打开：https://business.gemini.google

2. 确保已登录账号

3. 左侧应能看到历史对话列表

### 步骤3：抓取数据 ⏱️ 2-5分钟

1. 点击浏览器工具栏的扩展图标 📊

2. 在弹出窗口中点击 **"开始抓取"**

3. 等待抓取完成（进度条会更新）

4. 查看日志了解抓取进度

### 步骤4：导出数据 ⏱️ 30秒

1. 抓取完成后，点击 **"导出 JSON"**

2. 文件会自动下载到电脑

3. 文件名格式：`gemini-chats-2024-01-07-10-records.json`

## 下一步

### 验证数据
```bash
# 查看下载的文件
cat gemini-chats-*.json | jq '.totalChats'  # 查看对话数量
cat gemini-chats-*.json | jq '.chats[0].title'  # 查看第一个对话标题
```

### 遇到问题？

**运行诊断脚本：**
1. 在Gemini页面按 `F12` 打开控制台
2. 粘贴 `dom-checker.js` 的内容或运行：
   ```javascript
   // 如果有在线版本
   fetch('https://raw.githubusercontent.com/.../dom-checker.js').then(r=>r.text()).then(eval)
   ```
3. 查看输出结果

**检查选择器：**
```javascript
// 在控制台运行
document.querySelector('.conversation-list.more-visible')
document.querySelector('.content')
```

## 输出示例

```json
{
  "exportTime": "2024-01-07T10:30:00.000Z",
  "totalChats": 15,
  "sourceUrl": "https://business.gemini.google",
  "chats": [
    {
      "index": 1,
      "title": "帮我写代码",
      "timestamp": "2024-01-06T15:30:00.000Z",
      "messages": [
        {"role": "user", "content": "请帮我写一个Python脚本", "index": 1},
        {"role": "ai", "content": "当然可以，请描述具体需求...", "index": 2}
      ],
      "messageCount": 2
    }
  ]
}
```

## 常见问题快速解决

| 问题 | 解决方法 |
|------|----------|
| 扩展不显示 | 检查是否启用开发者模式 |
| 无法连接 | 刷新Gemini页面重试 |
| 找不到对话 | 确认已登录且有历史记录 |
| 抓取很慢 | 等待完成，不要切换页面 |
| 数据不完整 | 检查是否有"展开"按钮 |

## 技术支持

1. 查看详细日志（控制台 `[GeminiScraper]`）
2. 运行DOM检查脚本
3. 提供截图和错误信息
4. 提交Issue到项目仓库

## 下阶段功能

- [ ] 图片抓取
- [ ] 视频抓取
- [ ] Markdown导出
- [ ] Web Viewer

---

**💡 提示：** 定期运行扩展以获取最新的聊天记录！
