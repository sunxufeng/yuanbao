/**
 * 内容脚本（Content Script）
 *  - 「取当前页正文/标题」：供侧边栏“问当前页”（轻量，非完整 Readability，留待 M2 增强）。
 *  - 「划词工具条」：选中文本弹出浮动工具条（复制/翻译/总结/问问元宝），
 *    显示与重定位时做碰撞避让，不遮挡页面已有的其它弹窗（需求新增）。
 *  - 防御性修复（T1）：受限页面（chrome://、edge://、PDF viewer 等）无 chrome.runtime，
 *    直接退出，避免“报错但不影响使用”的注入噪声。
 */
import { SelectionToolbar } from './selectionToolbar';
import type { Box } from './positioning';
import { extractArticle } from './readability';

if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
  // 非扩展上下文（受限页面被注入），静默退出
  console.warn('[yuanbao-extension] content script skipped: no chrome runtime (restricted page?)');
} else {
  // —— 取页面正文（Readability 增强，M2/P0）——
  // 优先用 Readability 抽取干净正文；抽取失败回退 innerText。
  function getPageText(): { title: string; url: string; text: string; articleText: string } {
    const title = document.title || '';
    const url = location.href;
    const plain = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    const art = extractArticle(document);
    const articleText = art ? art.text : plain;
    return { title, url, text: plain.slice(0, 8000), articleText: articleText.slice(0, 8000) };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.action === 'getPageContent') {
      try {
        const { title, url, text, articleText } = getPageText();
        sendResponse({ ok: true, title, url, text, articleText });
      } catch (e) {
        sendResponse({ ok: false, error: (e as Error).message });
      }
      return true;
    }
    if (msg?.action === 'getSelectionText') {
      const text = (window.getSelection()?.toString() || '').trim();
      sendResponse({ ok: true, text });
      return true;
    }
    return false;
  });

  // —— 新增：划词工具条 ——
  const toolbar = new SelectionToolbar();
  toolbar.mount();

  const MAX_LEN = 5000;

  function getAnchor(): Box | null {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || !el.tagName) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
  }

  function handleSelection(target?: EventTarget | null) {
    const sel = window.getSelection();
    const text = (sel?.toString() || '').trim();
    if (!text || text.length > MAX_LEN) {
      toolbar.hide();
      return;
    }
    if (isEditable(target ?? null)) {
      toolbar.hide();
      return;
    }
    const anchor = getAnchor();
    if (!anchor) {
      toolbar.hide();
      return;
    }
    toolbar.show(text, anchor);
  }

  document.addEventListener('mouseup', (e) => handleSelection(e.target));
  document.addEventListener('contextmenu', () => handleSelection(window.getSelection()?.anchorNode ?? null));

  // selectionchange 较频繁，做防抖
  let debounce: number | undefined;
  document.addEventListener('selectionchange', () => {
    if (debounce) clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) handleSelection(sel.anchorNode);
    }, 120);
  });

  // 点击工具条外部 → 隐藏
  document.addEventListener('mousedown', (e) => {
    const host = toolbar.getHost();
    if (host && !e.composedPath().includes(host)) toolbar.hide();
  });

  // Esc 关闭
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toolbar.hide();
  });

  // 滚动：选区仍在则重定位（重新避让其它弹窗），选区消失则隐藏
  window.addEventListener(
    'scroll',
    () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) toolbar.hide();
      else toolbar.reposition();
    },
    true,
  );

  console.info('[yuanbao-extension] content script injected (with selection toolbar)');
}
