/**
 * Gemini Chat Scraper - Shadow DOM 检查工具
 * 在Gemini页面控制台运行此脚本，检查Shadow DOM结构
 */

(function() {
  'use strict';

  console.log('%c🔍 Gemini Shadow DOM 检查工具', 'font-size: 16px; font-weight: bold; color: #4285f4;');

  // Shadow DOM选择器查询器
  function querySelectorDeep(selectors) {
    const parts = selectors.split(' ').filter(s => s);
    if (parts.length === 0) return null;

    let current = document;
    for (const part of parts) {
      if (!current) return null;

      let element = current.querySelector ? current.querySelector(part) : null;

      if (!element && current.shadowRoot) {
        element = current.shadowRoot.querySelector(part);
      }

      if (!element) {
        element = querySelectorInShadow(current, part);
      }

      if (!element) return null;
      current = element;
    }

    return current;
  }

  function querySelectorInShadow(root, selector) {
    if (root.shadowRoot && root.shadowRoot.querySelector) {
      const found = root.shadowRoot.querySelector(selector);
      if (found) return found;
    }

    const children = root.querySelectorAll('*');
    for (const child of children) {
      if (child.shadowRoot) {
        const found = child.shadowRoot.querySelector(selector);
        if (found) return found;

        const deepFound = querySelectorInShadow(child, selector);
        if (deepFound) return deepFound;
      }
    }

    return null;
  }

  function querySelectorAllDeep(selectors) {
    const parts = selectors.split(' ').filter(s => s);
    if (parts.length === 0) return [];

    const lastSelector = parts.pop();
    const parentPath = parts.join(' ');

    let parent;
    if (parentPath) {
      parent = querySelectorDeep(parentPath);
    } else {
      parent = document;
    }

    if (!parent) return [];

    let results = [];

    if (parent.querySelectorAll) {
      results = Array.from(parent.querySelectorAll(lastSelector));
    }

    if (results.length === 0 && parent.shadowRoot) {
      results = Array.from(parent.shadowRoot.querySelectorAll(lastSelector));
    }

    if (results.length === 0) {
      results = querySelectorAllInShadow(parent, lastSelector);
    }

    return results;
  }

  function querySelectorAllInShadow(root, selector) {
    let results = [];

    if (root.shadowRoot) {
      const shadowResults = root.shadowRoot.querySelectorAll(selector);
      results = Array.from(shadowResults);
    }

    const children = root.querySelectorAll('*');
    for (const child of children) {
      if (child.shadowRoot) {
        const shadowResults = child.shadowRoot.querySelectorAll(selector);
        results = results.concat(Array.from(shadowResults));

        const deepResults = querySelectorAllInShadow(child, selector);
        results = results.concat(deepResults);
      }
    }

    return results;
  }

  // 检查页面信息
  function checkPageInfo() {
    console.group('📄 页面信息');
    console.log('URL:', window.location.href);
    console.log('hostname:', window.location.hostname);
    console.log('标题:', document.title);
    console.groupEnd();
  }

  // 检查Shadow Host
  function checkShadowHost() {
    console.group('🌐 Shadow Host');

    const shadowHost = document.querySelector('ucs-standalone-app');
    if (shadowHost) {
      console.log('✓ 找到 ucs-standalone-app');
      console.log('  - tagName:', shadowHost.tagName);
      console.log('  - className:', shadowHost.className);
      console.log('  - hasShadowRoot:', !!shadowHost.shadowRoot);
      if (shadowHost.shadowRoot) {
        console.log('  - shadowRoot children:', shadowHost.shadowRoot.children.length);
      }
    } else {
      console.log('✗ 未找到 ucs-standalone-app');
    }

    console.groupEnd();
    return shadowHost;
  }

  // 检查对话列表容器
  function checkChatList() {
    console.group('💬 对话列表容器');

    const selectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list',
      'ucs-standalone-app .conversation-list',
      '.conversation-list',
      '[class*="conversation-list"]'
    ];

    for (const selector of selectors) {
      const element = querySelectorDeep(selector);
      if (element) {
        console.log(`✓ 找到: ${selector}`);
        console.log('  - tagName:', element.tagName);
        console.log('  - className:', element.className);
        console.log('  - children数量:', element.children.length);
        console.log('  - 可见性:', element.offsetParent !== null ? '可见' : '不可见');

        // 尝试查找对话项
        const itemSelectors = [
          '.conversation-list-item',
          '[class*="conversation-list-item"]',
          '[class*="chat-item"]'
        ];

        for (const itemSelector of itemSelectors) {
          const items = querySelectorAllDeep(
            `ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list ${itemSelector}`
          );
          if (items.length > 0) {
            console.log(`  - 对话项 (${itemSelector}): ${items.length} 个`);
            break;
          }
        }

        return element;
      }
    }

    console.log('✗ 未找到对话列表容器');
    console.groupEnd();
    return null;
  }

  // 检查展开按钮
  function checkExpandButton() {
    console.group('📤 展开按钮');

    const buttonSelectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list .show-more-container',
      '.conversation-list .show-more-container',
      '.show-more-container'
    ];

    let found = false;
    for (const selector of buttonSelectors) {
      const button = querySelectorDeep(selector);
      if (button) {
        console.log(`✓ 找到: ${selector}`);
        console.log('  - 文本:', button.textContent?.trim());
        console.log('  - 可见性:', button.offsetParent !== null ? '可见' : '不可见');
        console.log('  - disabled:', button.disabled);
        found = true;
        break;
      }
    }

    if (!found) {
      console.log('✗ 未找到展开按钮');
    }

    console.groupEnd();
  }

  // 检查内容区域
  function checkContentArea() {
    console.group('📝 内容区域');

    const contentSelectors = [
      'ucs-standalone-app .content',
      '.content',
      '[class*="message-container"]',
      '[class*="chat-content"]'
    ];

    for (const selector of contentSelectors) {
      const element = querySelectorDeep(selector);
      if (element) {
        console.log(`✓ 找到: ${selector}`);
        console.log('  - tagName:', element.tagName);
        console.log('  - className:', element.className);
        console.log('  - 可见性:', element.offsetParent !== null ? '可见' : '不可见');

        // 查找消息
        const messageSelectors = [
          '[class*="message"]',
          '[class*="text-container"]',
          '[role="article"]'
        ];

        for (const msgSelector of messageSelectors) {
          const messages = querySelectorAllDeep(
            `ucs-standalone-app .content ${msgSelector}`
          );
          if (messages.length > 0) {
            console.log(`  - 消息 (${msgSelector}): ${messages.length} 个`);
            break;
          }
        }

        return element;
      }
    }

    console.log('✗ 未找到内容区域');
    console.groupEnd();
    return null;
  }

  // 检查消息结构
  function checkMessageStructure() {
    console.group('💭 消息结构');

    const messageSelectors = [
      '[class*="message"]',
      '[class*="text-container"]',
      '[role="article"]'
    ];

    for (const selector of messageSelectors) {
      const messages = querySelectorAllDeep(
        `ucs-standalone-app .content ${selector}`
      );

      if (messages.length > 0) {
        console.log(`找到 ${messages.length} 个消息元素 (${selector})`);

        const samples = messages.slice(0, 3);
        samples.forEach((msg, index) => {
          console.group(`消息 ${index + 1}`);
          console.log('类名:', msg.className);
          console.log('文本预览:', msg.textContent?.trim().substring(0, 100));
          console.groupEnd();
        });

        break;
      }
    }

    console.groupEnd();
  }

  // 完整检查
  function runAll() {
    console.clear();
    console.log('%c🔍 Gemini Shadow DOM 完整检查', 'font-size: 20px; font-weight: bold; color: #4285f4;');
    console.log('');

    checkPageInfo();
    const shadowHost = checkShadowHost();
    const chatList = checkChatList();
    checkExpandButton();
    const contentArea = checkContentArea();
    checkMessageStructure();

    console.log('');
    console.log('%c✅ 检查完成！', 'color: #34a853;');

    return {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      hasShadowHost: !!shadowHost,
      hasChatList: !!chatList,
      hasContentArea: !!contentArea
    };
  }

  // 导出结果
  function exportResults() {
    const results = {
      timestamp: new Date().toISOString(),
      url: window.location.href,

      shadowHost: null,
      chatList: null,
      content: null,
      messages: []
    };

    const shadowHost = document.querySelector('ucs-standalone-app');
    if (shadowHost) {
      results.shadowHost = {
        tagName: shadowHost.tagName,
        hasShadowRoot: !!shadowHost.shadowRoot
      };
    }

    const chatList = querySelectorDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list'
    );
    if (chatList) {
      results.chatList = {
        className: chatList.className,
        childCount: chatList.children.length
      };
    }

    const content = querySelectorDeep('ucs-standalone-app .content');
    if (content) {
      results.content = {
        className: content.className,
        childCount: content.children.length
      };
    }

    const messages = querySelectorAllDeep(
      'ucs-standalone-app .content [class*="message"]'
    );
    messages.slice(0, 10).forEach((msg, index) => {
      results.messages.push({
        index: index + 1,
        className: msg.className,
        textPreview: msg.textContent?.trim().substring(0, 50)
      });
    });

    console.log('%c📊 检查结果（可复制）:', 'color: #4285f4;');
    console.log(JSON.stringify(results, null, 2));

    return results;
  }

  // 导出为全局函数
  window.geminiScraperChecker = {
    querySelectorDeep,
    querySelectorAllDeep,
    checkPageInfo,
    checkShadowHost,
    checkChatList,
    checkExpandButton,
    checkContentArea,
    checkMessageStructure,
    runAll,
    exportResults
  };

  // 自动运行
  console.log('%c运行 geminiScraperChecker.runAll() 执行完整检查', 'color: #34a853;');
  console.log('可用命令:');
  console.log('  - geminiScraperChecker.runAll() - 完整检查');
  console.log('  - geminiScraperChecker.exportResults() - 导出结果');
  console.log('  - geminiScraperChecker.checkChatList() - 检查对话列表');
  console.log('  - geminiScraperChecker.checkContentArea() - 检查内容区域');

})();
