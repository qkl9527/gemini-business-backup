/**
 * Gemini Chat Scraper - DOM检查工具
 * 在Gemini页面控制台运行此脚本，检查Shadow DOM结构
 */

(function() {
  'use strict';

  console.log('%c🔍 Gemini DOM 检查工具', 'font-size: 16px; font-weight: bold; color: #4285f4;');

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
      console.log('  - hasShadowRoot:', !!shadowHost.shadowRoot);
    } else {
      console.log('✗ 未找到 ucs-standalone-app');
    }

    console.groupEnd();
    return shadowHost;
  }

  // 检查对话列表
  function checkChatList() {
    console.group('💬 对话列表');

    const selectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list',
      '.conversation-list'
    ];

    for (const selector of selectors) {
      const container = querySelectorDeep(selector);
      if (container) {
        console.log(`✓ 找到对话列表: ${selector}`);
        console.log('  - className:', container.className);
        console.log('  - children数量:', container.children.length);
        return container;
      }
    }

    console.log('✗ 未找到对话列表');
    console.groupEnd();
    return null;
  }

  // 检查展开按钮
  function checkExpandButton() {
    console.group('📤 展开按钮');

    const selectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list .show-more-container',
      '.show-more-container'
    ];

    for (const selector of selectors) {
      const button = querySelectorDeep(selector);
      if (button) {
        console.log(`✓ 找到展开按钮: ${selector}`);
        console.log('  - 文本:', button.textContent?.trim());
        console.log('  - disabled:', button.disabled);
        console.groupEnd();
        return button;
      }
    }

    console.log('✗ 未找到展开按钮');
    console.groupEnd();
    return null;
  }

  // 检查对话内容容器
  function checkConversationContainer() {
    console.group('💬 对话内容容器');

    const selectors = [
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation',
      'ucs-conversation'
    ];

    for (const selector of selectors) {
      const container = querySelectorDeep(selector);
      if (container) {
        console.log(`✓ 找到对话容器: ${selector}`);
        console.log('  - tagName:', container.tagName);
        console.log('  - className:', container.className);
        console.groupEnd();
        return container;
      }
    }

    console.log('✗ 未找到对话容器');
    console.groupEnd();
    return null;
  }

  // 检查所有turn
  function checkTurns() {
    console.group('🔄 对话轮次(turns)');

    const turns = querySelectorAllDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn'
    );

    console.log(`找到 ${turns.length} 个对话轮次`);

    if (turns.length > 0) {
      console.log('示例分析:');
      const firstTurn = turns[0];
      console.log('  - 第一个turn类名:', firstTurn.className);

      // 检查用户问题
      const userText = querySelectorDeep(
        '.question-block ucs-fast-markdown .markdown-document p span'
      );
      if (userText) {
        console.log('  - 用户文本:', userText.textContent?.trim().substring(0, 50));
      }

      // 检查用户图片
      const userImages = querySelectorAllDeep(
        '.question-block ucs-summary ucs-summary-attachments .attachment-container ucs-markdown-image'
      );
      console.log(`  - 用户图片数量: ${userImages.length}`);

      // 检查AI回答
      const aiText = querySelectorDeep(
        '.ucs-summary .summary-container .summary-contents ucs-text-streamer ucs-response-markdown ucs-fast-markdown .markdown-document'
      );
      if (aiText) {
        console.log('  - AI回复存在: 是');
      }

      // 检查AI图片
      const aiImages = querySelectorAllDeep(
        '.ucs-summary .attachment-container ucs-markdown-image'
      );
      console.log(`  - AI图片数量: ${aiImages.length}`);
    }

    console.groupEnd();
    return turns;
  }

  // 提取用户问题文本
  function extractUserQuestion() {
    const textEl = querySelectorDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn .question-block ucs-fast-markdown .markdown-document p span'
    );
    return textEl?.textContent?.trim() || '';
  }

  // 提取用户图片
  function extractUserImages() {
    const images = [];
    const imageContainers = querySelectorAllDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn .question-block ucs-summary ucs-summary-attachments .attachment-container ucs-markdown-image'
    );

    imageContainers.forEach(imgEl => {
      if (imgEl.shadowRoot) {
        const img = imgEl.shadowRoot.querySelector('img');
        if (img) {
          images.push({
            src: img.src || img.getAttribute('src'),
            alt: img.alt || ''
          });
        }
      }
    });

    return images;
  }

  // 提取AI回答
  function extractAIResponse() {
    const aiEl = querySelectorDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn .ucs-summary .summary-container .summary-contents ucs-text-streamer ucs-response-markdown ucs-fast-markdown .markdown-document'
    );
    return aiEl?.outerHTML || aiEl?.innerHTML || '';
  }

  // 提取AI图片
  function extractAIImages() {
    const images = [];
    const imageContainers = querySelectorAllDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn .ucs-summary .attachment-container ucs-markdown-image'
    );

    imageContainers.forEach(imgEl => {
      if (imgEl.shadowRoot) {
        const img = imgEl.shadowRoot.querySelector('img');
        if (img) {
          images.push({
            src: img.src || img.getAttribute('src'),
            alt: img.alt || ''
          });
        }
      }
    });

    return images;
  }

  // 完整检查
  function runAll() {
    console.clear();
    console.log('%c🔍 Gemini DOM 完整检查', 'font-size: 20px; font-weight: bold; color: #4285f4;');
    console.log('');

    checkPageInfo();
    checkShadowHost();
    checkChatList();
    checkExpandButton();
    checkConversationContainer();
    checkTurns();

    console.log('');
    console.log('%c✅ 检查完成！', 'color: #34a853;');

    return {
      timestamp: new Date().toISOString(),
      url: window.location.href
    };
  }

  // 提取完整数据示例
  function extractSampleData() {
    console.group('📊 示例数据提取');

    const turns = querySelectorAllDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn'
    );

    const sampleData = {
      totalTurns: turns.length,
      turns: []
    };

    turns.slice(0, 2).forEach((turn, index) => {
      const turnData = {
        index: index + 1,
        user: {
          text: '',
          images: []
        },
        ai: {
          html: '',
          images: []
        }
      };

      // 用户文本
      const userText = turn.querySelector ?
        turn.querySelector('.question-block ucs-fast-markdown .markdown-document p span') : null;
      if (!userText && turn.shadowRoot) {
        const shadowText = turn.shadowRoot.querySelector(
          '.question-block ucs-fast-markdown .markdown-document p span'
        );
        if (shadowText) {
          turnData.user.text = shadowText.textContent?.trim() || '';
        }
      } else if (userText) {
        turnData.user.text = userText.textContent?.trim() || '';
      }

      // AI HTML
      const aiHtml = turn.querySelector ?
        turn.querySelector('.ucs-summary .summary-container .summary-contents ucs-text-streamer ucs-response-markdown ucs-fast-markdown .markdown-document') : null;
      if (!aiHtml && turn.shadowRoot) {
        const shadowHtml = turn.shadowRoot.querySelector(
          '.ucs-summary .summary-container .summary-contents ucs-text-streamer ucs-response-markdown ucs-fast-markdown .markdown-document'
        );
        if (shadowHtml) {
          turnData.ai.html = shadowHtml.outerHTML?.substring(0, 200) || '';
        }
      } else if (aiHtml) {
        turnData.ai.html = aiHtml.outerHTML?.substring(0, 200) || '';
      }

      sampleData.turns.push(turnData);
    });

    console.log(JSON.stringify(sampleData, null, 2));
    console.groupEnd();
    return sampleData;
  }

  // 导出结果
  function exportResults() {
    const results = {
      timestamp: new Date().toISOString(),
      url: window.location.href,

      shadowHost: !!document.querySelector('ucs-standalone-app'),

      chatList: null,
      conversationContainer: null,
      turnsCount: 0,

      sampleData: null
    };

    const chatList = querySelectorDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-nav-panel .conversation-list'
    );
    if (chatList) {
      results.chatList = {
        className: chatList.className,
        childCount: chatList.children.length
      };
    }

    const convContainer = querySelectorDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation'
    );
    if (convContainer) {
      results.conversationContainer = convContainer.tagName;
    }

    const turns = querySelectorAllDeep(
      'ucs-standalone-app .ucs-standalone-outer-row-container ucs-results ucs-conversation .main .turn'
    );
    results.turnsCount = turns.length;

    results.sampleData = extractSampleData();

    console.log('%c📊 检查结果:', 'color: #4285f4;');
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
    checkConversationContainer,
    checkTurns,
    extractUserQuestion,
    extractUserImages,
    extractAIResponse,
    extractAIImages,
    runAll,
    extractSampleData,
    exportResults
  };

  console.log('%c使用说明:', 'color: #34a853; font-weight: bold;');
  console.log('  geminiScraperChecker.runAll() - 完整检查');
  console.log('  geminiScraperChecker.checkTurns() - 检查对话轮次');
  console.log('  geminiScraperChecker.extractSampleData() - 提取示例数据');
  console.log('  geminiScraperChecker.exportResults() - 导出诊断结果');

})();
