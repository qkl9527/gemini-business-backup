# Gemini Chat Scraper

A powerful browser extension that extracts your Gemini Business chat history for backup and analysis purposes.

[english](README.md) | [中文](README_CN.md)

## 🌟 Features

### Current Version (v1.0.0)
- ✅ **Chat List Extraction** - Automatically fetches all your conversation history
- ✅ **Text Content Extraction** - Captures complete message content from both users and AI
- ✅ **Real-time Progress Display** - Shows extraction progress with live updates
- ✅ **Detailed Logging** - Comprehensive logging for debugging and monitoring
- ✅ **JSON Export** - Clean, structured data export in JSON format
- ✅ **Cross-browser Support** - Works on Chrome, Firefox, Edge, and Brave

### Planned Features
- 📷 Image capture and download
- 🎥 Video capture and download
- 📝 Markdown export format
- 🔍 Web Viewer for browsing exported data

## 🚀 Quick Start

### Installation (Chrome/Edge/Brave)
1. Open extensions page: `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked extension**
4. Select the `chrome-extension` folder
5. Visit `https://business.gemini.google/` and click the extension icon

### Installation (Firefox)
1. Open debugging page: `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `firefox-extension/manifest.json` file
4. Visit `https://business.gemini.google/` and use the extension

### Basic Usage
1. **Login** to your Gemini Business account
2. **Open** the extension popup from your browser toolbar
3. **Click** "Start Scraping" and wait for completion
4. **Export** your data using the "Export JSON" button

## 📊 Data Format

The extension exports your chat data in a structured JSON format:

```json
{
  "exportTime": "2024-01-07T10:30:00.000Z",
  "totalChats": 10,
  "sourceUrl": "https://business.gemini.google",
  "chats": [
    {
      "index": 1,
      "title": "Sample Conversation",
      "timestamp": "2024-01-07T10:30:00.000Z",
      "messages": [
        {
          "role": "user",
          "content": "User message here",
          "index": 1
        },
        {
          "role": "ai", 
          "content": "AI response here",
          "index": 2
        }
      ],
      "messageCount": 2
    }
  ]
}
```

## 🛠️ Project Structure

```
gemini-chat-scraper/
├── chrome-extension/          # Chrome extension build
│   ├── manifest.json         # Extension configuration
│   ├── content.js            # Core scraping logic
│   ├── background.js         # Background service worker
│   ├── dom-checker.js        # DOM debugging tools
│   ├── jszip.min.js          # ZIP library
│   ├── popup/               # Extension UI
│   │   ├── popup.html      # Main popup interface
│   │   ├── popup.css       # Styling
│   │   └── popup.js        # UI logic
│   └── icons/               # Extension icons
├── firefox-extension/        # Firefox-specific build
│   ├── manifest.json        # Firefox manifest
│   ├── content.js          # Shared content script
│   ├── background.js       # Firefox background script
│   └── popup/              # Shared popup UI
└── md/                     # Documentation
    ├── spec.md             # Technical specifications
    ├── implementation-plan.md
    └── gemini_content.md
```

## 🔧 Troubleshooting

### Common Issues

**Extension not connecting to page:**
1. Refresh the Gemini page
2. Ensure you're on the correct URL (`business.gemini.google`)
3. Check that the extension is enabled

**No conversations found:**
1. Make sure you're logged into your Gemini account
2. Verify there are historical conversations in the left sidebar
3. Run DOM checker: `geminiScraperChecker.checkChatList()` in console

**Incomplete content extraction:**
1. Check for "Expand" buttons that need to be clicked
2. Wait for the page to fully load
3. Check console for error messages

### Debug Tools

**Run diagnostic script:**
1. Press `F12` to open developer console on Gemini page
2. Run: `geminiScraperChecker.runAll()`
3. Export results: `geminiScraperChecker.exportResults()`

**Check individual elements:**
```javascript
geminiScraperChecker.checkChatList()      // Check conversation list
geminiScraperChecker.checkContentArea()   // Check content area
```

## 🌐 Browser Compatibility

| Browser | Minimum Version | Status | Notes |
|---------|----------------|--------|-------|
| Chrome  | 88+            | ✅ Full Support | Recommended |
| Firefox | 109+           | ⚠️ Partial Support | Manifest V3 limitations |
| Edge    | 88+            | ✅ Full Support | Same as Chrome |
| Brave   | Latest         | ✅ Full Support | Chromium-based |

## 🔒 Privacy & Security

This extension only accesses:
- Content from `https://*.business.gemini.google/*` domains
- Local storage for temporary data
- Active tab when explicitly activated

**No data is sent to external servers** - all processing happens locally in your browser.

## 📋 Permissions Required

- `activeTab` - Access current tab when user clicks extension
- `scripting` - Inject content scripts for data extraction
- `storage` - Store temporary data locally
- `tabs` - Navigate and manage tabs
- `host_permissions` - Limited to business.gemini.google domains

## 🔄 Development

### Making Changes
1. Modify source files in the appropriate extension folder
2. Reload extension in `chrome://extensions/` or Firefox debug page
3. Test changes on Gemini page

### Testing Process
1. Visit Gemini Business page
2. Open extension popup
3. Start scraping process
4. Monitor progress and logs
5. Export and verify data integrity

## 📝 Changelog

### v1.0.0 (2024-01-07)
- Initial release
- Basic text scraping functionality
- JSON export capability
- Progress tracking system
- Comprehensive logging
- Cross-browser support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on both Chrome and Firefox
5. Submit a pull request with detailed description

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- 📋 Check the troubleshooting section above
- 🔧 Run the DOM checker diagnostic tool
- 📸 Provide screenshots and error messages
- 🐛 Submit issues to the repository with detailed information

---

**⚡ Pro Tip:** Regularly export your chat history to maintain backups of important conversations!