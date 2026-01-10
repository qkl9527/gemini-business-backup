# Gemini Chat Scraper - Firefox Extension

## 安装方法

### 方法一：临时加载（推荐用于开发测试）

1. 打开Firefox浏览器
2. 在地址栏输入 `about:debugging` 并按回车
3. 点击左侧菜单中的 "此 Firefox"
4. 点击 "临时载入附加组件"
5. 选择当前目录下的 `manifest.json` 文件
6. 点击 "打开"

### 方法二：打包安装

1. 打开Firefox浏览器
2. 访问 https://addons.mozilla.org/developers/
3. 注册/登录Mozilla账号
4. 点击 "提交附加组件"
5. 选择 "打包的扩展" 并选择当前目录
6. 上传生成的 `.xpi` 文件
7. 提交审核或通过自托管分发

## 使用方法

1. 打开 https://business.gemini.google.com
2. 确保已登录
3. 点击工具栏上的扩展图标
4. 设置抓取参数（可选）
5. 点击 "开始抓取"
6. 等待抓取完成
7. 导出数据（JSON / Markdown / ZIP）

## 文件结构

```
firefox-extension/
├── manifest.json          # 扩展配置（Firefox专用）
├── background.js          # 后台脚本
├── content.js             # 内容脚本（抓取逻辑）
├── jszip.min.js           # ZIP打包库
├── icons/                 # 图标文件
│   ├── icon16.svg
│   ├── icon48.svg
│   └── icon128.svg
└── popup/                 # 弹出窗口
    ├── popup.html
    ├── popup.css
    └── popup.js
```

## 与Chrome版本的区别

- 使用 `browser_specific_settings` 指定Firefox特有配置
- 后台脚本使用 `scripts` 而非 `service_worker`（Firefox对MV3的兼容性）
- 扩展ID设置为 `geminiscraper@firefox.example.com`
- 最低Firefox版本要求：109.0

## 开发调试

1. 打开 `about:debugging`
2. 找到 "Gemini Chat Scraper" 扩展
3. 点击 "检查" 打开开发者工具
4. 查看Console和Network面板进行调试

## 问题排查

- 如果扩展无响应，尝试刷新页面后重新打开扩展
- 确保在Gemini Business页面使用
- 检查浏览器控制台是否有错误信息
