/**
 * Gemini Chat Scraper - 调试工具
 */

(function() {
  console.log('%c🔧 Gemini 调试工具', 'font-size: 16px; font-weight: bold; color: #4285f4;');

  // 获取对话列表容器
  function getChatListContainer() {
    return document.querySelector('ucs-standalone-app').shadowRoot.querySelector("ucs-nav-panel").shadowRoot.querySelector(".conversation-list");
  }

  // 获取对话列表项（点击内部的.list-item元素，包含展开"显示更多"）
  async function getChatItems() {
    const navPanel = document.querySelector('ucs-standalone-app').shadowRoot.querySelector("ucs-nav-panel");
    if (!navPanel || !navPanel.shadowRoot) {
      console.warn('未找到导航面板');
      return [];
    }
    const navShadow = navPanel.shadowRoot;
    const conversationList = navShadow.querySelector(".conversation-list");
    if (!conversationList) {
      console.warn('未找到对话列表');
      return [];
    }

    const items = [];

    // 获取初始列表
    const initialContainers = conversationList.querySelectorAll(".conversation-container");
    initialContainers.forEach(container => {
      const listItem = container.querySelector('.list-item');
      if (listItem) {
        items.push(listItem);
      }
    });

    console.log(`初始找到 ${items.length} 个对话项`);

    // 检查是否有"显示更多"按钮
    const showMoreContainer = conversationList.querySelector(".show-more-container");
    if (showMoreContainer) {
      const showMoreBtn = showMoreContainer.querySelector(".show-more");
      if (showMoreBtn) {
        console.log('发现"显示更多"按钮，尝试展开...');
        try {
          showMoreBtn.click();
          console.log('已点击"显示更多"，等待加载...');

          // 等待展开
          await new Promise(resolve => setTimeout(resolve, 2000));

          // 获取展开后的列表
          const moreList = conversationList.querySelector(".more-conversation-list");
          if (moreList) {
            const moreContainers = moreList.querySelectorAll(".conversation-container");
            console.log(`展开后新增 ${moreContainers.length} 个对话项`);

            moreContainers.forEach(container => {
              const listItem = container.querySelector('.list-item');
              if (listItem) {
                items.push(listItem);
              }
            });
          }
        } catch (e) {
          console.warn(`展开"显示更多"失败: ${e.message}`);
        }
      }
    }

    console.log(`共找到 ${items.length} 个对话项`);
    return items;
  }

  // 获取turns
  function getTurns() {
    const app = document.querySelector('ucs-standalone-app');
    if (!app || !app.shadowRoot) return [];
    
    const results = app.shadowRoot.querySelector(".ucs-standalone-outer-row-container ucs-results");
    if (!results || !results.shadowRoot) return [];
    
    const conv = results.shadowRoot.querySelector("ucs-conversation");
    if (!conv || !conv.shadowRoot) return [];
    
    return conv.shadowRoot.querySelectorAll(".main .turn");
  }

  // 提取单个turn的用户内容
  function extractTurnUserContent(turn) {
    const result = { text: '', images: [] };

    const markdownEl = turn.querySelector(".question-block ucs-fast-markdown");
    if (markdownEl && markdownEl.shadowRoot) {
      const span = markdownEl.shadowRoot.querySelector(".markdown-document p span");
      if (span) {
        result.text = span.textContent.trim();
      }
    }

    const summaryEl = turn.querySelector("ucs-summary");
    if (summaryEl && summaryEl.shadowRoot) {
      const attachmentsEl = summaryEl.shadowRoot.querySelector("ucs-summary-attachments");
      if (attachmentsEl && attachmentsEl.shadowRoot) {
        const containerEl = attachmentsEl.shadowRoot.querySelector(".attachment-container");
        if (containerEl) {
          const markdownImages = containerEl.querySelectorAll("ucs-markdown-image");
          markdownImages.forEach(imgEl => {
            if (imgEl && imgEl.shadowRoot) {
              const img = imgEl.shadowRoot.querySelector("img");
              if (img && img.src) {
                result.images.push({ type: 'image', src: img.src, role: 'user' });
              }
            }
          });
        }
      }
    }

    return result;
  }

  // 提取单个turn的AI内容
  function extractTurnAIResponse(turn) {
    const result = { text: '', images: [] };

    const summaryEl = turn.querySelector("ucs-summary");
    if (!summaryEl || !summaryEl.shadowRoot) {
      return result;
    }

    const containerEl = summaryEl.shadowRoot.querySelector(".summary-container .summary-contents ucs-text-streamer");
    if (containerEl && containerEl.shadowRoot) {
      const responseEl = containerEl.shadowRoot.querySelector("ucs-response-markdown");
      if (responseEl && responseEl.shadowRoot) {
        const markdownEl = responseEl.shadowRoot.querySelector("ucs-fast-markdown");
        if (markdownEl && markdownEl.shadowRoot) {
          const docEl = markdownEl.shadowRoot.querySelector(".markdown-document");
          if (docEl) {
            result.text = docEl.outerHTML;
          }
        }
      }
    }

    if (!result.text) {
      const attachContainer = summaryEl.shadowRoot.querySelector(".attachment-container");
      if (attachContainer) {
        const markdownImages = attachContainer.querySelectorAll("ucs-markdown-image");
        markdownImages.forEach(imgEl => {
          if (imgEl && imgEl.shadowRoot) {
            const img = imgEl.shadowRoot.querySelector("img");
            if (img && img.src) {
              result.images.push({ type: 'image', src: img.src, role: 'ai' });
            }
          }
        });
      }
    }

    return result;
  }

  // 测试点击
  async function testClick(index = 0) {
    const items = await getChatItems();
    if (items.length === 0) {
      console.log('❌ 未找到对话列表');
      return false;
    }

    const item = items[index];
    console.log(`🖱️ 点击第 ${index + 1} 个对话...`);

    const urlBefore = window.location.href;
    item.click();

    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const turns = getTurns();
      console.log(`  [${i+1}s] Turns: ${turns.length}`);

      if (turns.length > 0) {
        console.log('✅ 找到对话内容');
        return true;
      }
    }

    console.log('⚠️ 等待超时');
    return false;
  }

  // 提取消息（处理所有turns）
  function extractMessages() {
    const messages = [];
    const turns = getTurns();

    console.log(`找到 ${turns.length} 个对话轮次`);

    if (turns.length === 0) {
      console.warn('未找到任何对话轮次');
      return messages;
    }

    turns.forEach((turn, turnIndex) => {
      const userContent = extractTurnUserContent(turn);
      if (userContent.text || userContent.images.length > 0) {
        messages.push({
          role: 'user',
          text: userContent.text,
          images: userContent.images,
          turnIndex: turnIndex + 1
        });
      }

      const aiContent = extractTurnAIResponse(turn);
      if (aiContent.text || aiContent.images.length > 0) {
        messages.push({
          role: 'ai',
          text: aiContent.text,
          images: aiContent.images,
          turnIndex: turnIndex + 1
        });
      }
    });

    console.log(`提取到 ${messages.length} 条消息（${turns.length} 轮对话）`);
    return messages;
  }

  // 完整测试
  async function runFullTest() {
    console.clear();
    console.log('%c🧪 完整测试', 'font-size: 16px; font-weight: bold; color: #4285f4;');
    console.log('');

    const app = document.querySelector('ucs-standalone-app');
    console.log(`1. Shadow Host: ${app ? '✅' : '❌'}`);

    const items = await getChatItems();
    console.log(`2. 对话列表: ${items.length} 个`);

    if (items.length > 0) {
      console.log('3. 测试点击...');
      const result = await testClick(0);

      if (result) {
        console.log('4. 提取所有消息...');
        const messages = extractMessages();
        console.log(`   共 ${messages.length} 条消息`);

        messages.forEach((m, i) => {
          const textPreview = m.text ? m.text.substring(0, 40).replace(/<[^>]+>/g, '') : '';
          console.log(`   [${i+1}] Turn${m.turnIndex} ${m.role}: ${textPreview}${textPreview ? '...' : '(no text)'} ${m.images.length} 图`);
        });

        console.log('');
        console.log('5. 消息详情:');
        messages.forEach((m, i) => {
          console.log(`   --- 消息 ${i+1} (${m.role}) ---`);
          if (m.text) {
            console.log(`     文本长度: ${m.text.length} chars`);
          }
          if (m.images.length > 0) {
            console.log(`     图片: ${m.images.length} 张`);
            m.images.forEach((img, idx) => {
              console.log(`       [${idx+1}] ${img.src.substring(0, 60)}...`);
            });
          }
        });
      }
    }

    console.log('');
    console.log('%c✅ 完成', 'color: #34a853;');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 导出
  window.geminiDebug = {
    getChatListContainer,
    getChatItems,
    getTurns,
    extractTurnUserContent,
    extractTurnAIResponse,
    extractMessages,
    testClick,
    runFullTest,
    testImageFetch
  };

  async function testImageFetch() {
    console.clear();
    console.log('%c🖼️ 图片获取测试', 'font-size: 16px; font-weight: bold; color: #4285f4;');

    const messages = extractMessages();
    const allImages = [];

    messages.forEach(msg => {
      msg.images.forEach(img => {
        allImages.push({ src: img.src, role: img.role, messageRole: msg.role });
      });
    });

    if (allImages.length === 0) {
      console.log('❌ 未找到任何图片');
      return;
    }

    console.log(`找到 ${allImages.length} 张图片`);

    for (let i = 0; i < Math.min(allImages.length, 3); i++) {
      const img = allImages[i];
      console.log(`\n--- 测试图片 ${i + 1} ---`);
      console.log(`URL: ${img.src.substring(0, 80)}...`);
      console.log(`Role: ${img.role}`);

      // 尝试在DOM中查找
      const domImg = document.querySelectorAll('img');
      let foundInDOM = false;
      for (const d of domImg) {
        if (d.src === img.src) {
          console.log(`✅ 在DOM中找到对应img元素`);
          console.log(`   naturalWidth: ${d.naturalWidth}, naturalHeight: ${d.naturalHeight}`);
          foundInDOM = true;
          break;
        }
      }
      if (!foundInDOM) {
        console.log(`⚠️ 未在DOM中找到对应img元素`);
      }
    }
  }

  console.log('');
  console.log('%c命令:', 'color: #34a853; font-weight: bold;');
  console.log('  geminiDebug.runFullTest()           - 完整测试');
  console.log('  geminiDebug.testImageFetch()        - 测试图片获取');
  console.log('  geminiDebug.testClick(0)            - 测试点击');
  console.log('  geminiDebug.extractMessages()       - 提取所有消息');
  console.log('  geminiDebug.getTurns()              - 获取所有对话轮次');
  console.log('');

})();
