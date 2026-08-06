/**
 * 后台中枢 Service Worker（MV3）
 *  - 唯一对外出口：鉴权/编排/路由（见系统设计第 4、5.2 章）。
 *  - 处理 UI → 后台的普通消息（getProviders / saveProviders / getModels / testProvider / defaultModel）。
 *  - 处理长连接 Port（chat / transform 流式输出）。
 *  - 注册 commands（翻译选中 / 总结页面），转发到侧边栏或后台处理。
 */
import type { FromBackground, StreamMessage, ToBackground } from '@/shared/messages';
import { PORT_NAME, PENDING_TRANSFORM_KEY, type PendingTransform } from '@/shared/messages';
import { getManager, ProviderManager } from '@/core/providerManager';
import { track } from '@/core/analytics';
import { getProviders, saveProviders, getDefaultModel, setDefaultModel } from '@/core/storage';
import type { ChatRequest, ProviderConfig, TransformRequest } from '@/types/model';
import { hasSidePanel, safeChrome } from '@/shared/browserSupport';

/**
 * 截取当前激活标签页的可见区域（视觉问答用）。
 * 返回 data URL（JPEG，quality 80，控制体积便于存入 storage.local）。
 * 抛出错误时由调用方兜底（如“当前页面不支持截图”）。
 */
function captureVisibleTab(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 }, (dataUrl?: string) => {
        const err = chrome.runtime.lastError;
        if (err) reject(new Error(err.message || 'capture failed'));
        else if (dataUrl) resolve(dataUrl);
        else reject(new Error('capture returned empty'));
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

let manager: ProviderManager | null = null;

async function ensureManager(): Promise<ProviderManager> {
  if (!manager) manager = await getManager();
  return manager;
}

// 收到 saveProviders 后需要重建 manager 实例
async function reloadManager() {
  manager = await new ProviderManager().init();
}

/**
 * 安装 / 更新时：
 *  - 首次写入预置 Provider（getProviders 内部已处理“空则注入”）。
 *  - Chrome 下把工具栏图标点击行为设为“打开侧边栏”（若支持 sidePanel）。
 *  - Firefox 不支持 sidePanel，自动跳过，回退到 popup（default_popup）。
 * 全部用能力探测 + safeChrome 包裹，避免“报错但不影响使用”。
 */
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await getProviders(); // 触发首次写入预置项
    if (hasSidePanel()) {
      await safeChrome(
        () => (chrome as unknown as { sidePanel: { setPanelBehavior: (b: { openInSidePanel: boolean }) => Promise<void> } }).sidePanel.setPanelBehavior({ openInSidePanel: true }),
        Promise.resolve(),
      );
    }
    console.info('[yuanbao-extension] installed/updated; defaults seeded', { firefox: false });
  } catch (e) {
    void track('runtime_error');
    console.warn('[yuanbao-extension] onInstalled error:', (e as Error).message);
  }
});

chrome.runtime.onMessage.addListener((msg: ToBackground, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'getProviders': {
          const providers = await getProviders();
          sendResponse({ ok: true, providers } as FromBackground);
          return;
        }
        case 'saveProviders': {
          await saveProviders(msg.providers);
          await reloadManager();
          sendResponse({ ok: true, providers: msg.providers } as FromBackground);
          return;
        }
        case 'getModels': {
          const mgr = await ensureManager();
          sendResponse({ ok: true, models: mgr.listModels() } as FromBackground);
          return;
        }
        case 'testProvider': {
          const mgr = await ensureManager();
          const tested = await mgr.testProvider(msg.providerId);
          sendResponse({ ok: true, tested } as FromBackground);
          return;
        }
        case 'getDefaultModel': {
          const id = await getDefaultModel();
          sendResponse({ ok: true, defaultModel: id } as FromBackground);
          return;
        }
        case 'setDefaultModel': {
          await setDefaultModel(msg.modelId);
          sendResponse({ ok: true, defaultModel: msg.modelId } as FromBackground);
          return;
        }
        case 'askYuanbao': {
          // 划词工具条“问问元宝”：写入待问文本，并（若支持）打开侧边栏
          const text = (msg as unknown as { text?: string }).text ?? '';
          try {
            await chrome.storage.local.set({ yb_pending_ask: text });
          } catch {
            /* ignore */
          }
          const tabId = sender.tab?.id;
          if (hasSidePanel() && tabId != null) {
            await safeChrome(() => chrome.sidePanel.open({ tabId }), Promise.resolve());
          }
          sendResponse({ ok: true } as FromBackground);
          return;
        }
        case 'captureAndAsk': {
          // 划词工具条“截图提问”：截取当前可见页面，写入待问图片（视觉问答），并打开侧边栏
          const text = (msg as unknown as { text?: string }).text ?? '';
          try {
            const dataUrl = await captureVisibleTab();
            try {
              await chrome.storage.local.set({ yb_pending_image: dataUrl });
              if (text) await chrome.storage.local.set({ yb_pending_ask: text });
            } catch {
              /* storage 写入失败不影响截图结果返回 */
            }
            const tabId = sender.tab?.id;
            if (hasSidePanel() && tabId != null) {
              await safeChrome(() => chrome.sidePanel.open({ tabId }), Promise.resolve());
            }
            sendResponse({ ok: true } as FromBackground);
          } catch (e) {
            sendResponse({ ok: false, error: (e as Error).message } as FromBackground);
          }
          return;
        }
        case 'getPageContent': {
          // 由侧边栏“问当前页”触发：转发到当前激活标签页的内容脚本，取正文（含 Readability 抽取）
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
              sendResponse({ ok: false, error: '未找到激活标签页' } as FromBackground);
              return;
            }
            chrome.tabs.sendMessage(tab.id, { action: 'getPageContent' }, (resp: unknown) => {
              const err = chrome.runtime.lastError;
              if (err) sendResponse({ ok: false, error: err.message || '内容脚本未响应' } as FromBackground);
              else sendResponse(resp as FromBackground);
            });
            return true; // 异步 sendResponse
          } catch (e) {
            sendResponse({ ok: false, error: (e as Error).message } as FromBackground);
            return;
          }
        }
        default:
          sendResponse({ ok: false, error: '未知 action' } as FromBackground);
      }
    } catch (e) {
      void track('runtime_error');
      sendResponse({ ok: false, error: (e as Error).message } as FromBackground);
    }
  })();
  return true; // 保持 sendResponse 异步可用
});

// 长连接：流式 chat / transform
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  port.onMessage.addListener(async (msg: { action: 'chat' | 'transform'; req: ChatRequest | TransformRequest }) => {
    const mgr = await ensureManager();
    const emit = (m: StreamMessage) => port.postMessage(m);
    try {
      if (msg.action === 'chat') {
        const req = msg.req as ChatRequest;
        // 将“问当前页”的网页正文注入为 system 消息（若提供 pageContext）
        const messages =
          req.pageContext
            ? [{ role: 'system' as const, content: `以下是用户当前浏览的网页正文，可作为回答问题的参考：\n\n${req.pageContext}` }, ...req.messages]
            : req.messages;
        for await (const c of mgr.chatWithFallback({ ...req, messages })) {
          if (c.error) emit({ type: 'error', message: c.error });
          else emit({ type: 'chunk', delta: c.delta });
          if (c.done) emit({ type: 'done' });
        }
      } else if (msg.action === 'transform') {
        for await (const c of mgr.transform(msg.req as TransformRequest)) {
          if (c.error) emit({ type: 'error', message: c.error });
          else emit({ type: 'chunk', delta: c.delta });
          if (c.done) emit({ type: 'done' });
        }
      }
    } catch (e) {
      emit({ type: 'error', message: (e as Error).message });
      emit({ type: 'done' });
    }
  });
});

// 快捷键命令：Alt+1 翻译选中 / Alt+2 总结页面（PRD §6）
// 实际动作：取文本 → 写入待执行任务 → 打开侧边栏，由 ChatPanel 消费并执行 transform。
chrome.commands?.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    let payload: PendingTransform | null = null;
    if (command === 'translate_selection') {
      const text = await sendToContent<string>(tab.id, { action: 'getSelectionText' });
      payload = { kind: 'translate', text: typeof text === 'string' ? text : '' };
    } else if (command === 'summarize_page') {
      const page = await sendToContent<{ text: string; articleText?: string }>(tab.id, { action: 'getPageContent' });
      const text = page?.articleText || page?.text || '';
      payload = { kind: 'summarize', text };
    }
    if (!payload) return;

    try {
      await chrome.storage.local.set({ [PENDING_TRANSFORM_KEY]: payload });
    } catch {
      /* ignore */
    }
    if (hasSidePanel() && tab.id != null) {
      await safeChrome(() => chrome.sidePanel.open({ tabId: tab.id! }), Promise.resolve());
    }
  } catch (e) {
    void track('runtime_error');
    console.warn('[yuanbao] command error:', (e as Error).message);
  }
});

/** 向内容脚本发消息并取回响应（Promise 化 + 吞掉 lastError） */
function sendToContent<T = unknown>(tabId: number, msg: ToBackground): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp: unknown) => {
        const err = chrome.runtime.lastError;
        if (err) resolve(undefined);
        else resolve(resp as T | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

console.info('[yuanbao-extension] background service worker ready');
