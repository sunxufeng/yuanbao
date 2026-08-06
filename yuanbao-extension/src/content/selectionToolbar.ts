/**
 * 划词浮动工具条（Selection Toolbar）
 *  - 选中文本后，在选区附近弹出：复制 / 翻译 / 总结 / 问问元宝。
 *  - 用 Shadow DOM 隔离页面样式，避免被站点 CSS 影响，也不污染页面。
 *  - 显示/重定位时调用碰撞避让（positioning + obstacles），确保不遮挡页面已有弹窗。
 */

import { computeToolbarPlacement, type Box } from './positioning';
import { detectObstacles } from './obstacles';
import { api, streamTransform } from '@/shared/client';

const STYLE = `
:host {
  all: unset;
  position: fixed;
  z-index: 2147483600;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.yb-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 6px 24px rgba(0,0,0,.16);
}
.yb-bar button {
  border: none;
  background: transparent;
  color: #1f2937;
  font-size: 13px;
  line-height: 1;
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  white-space: nowrap;
}
.yb-bar button:hover { background: #f3f4f6; }
.yb-bar button:active { background: #e5e7eb; }
.yb-result {
  margin-top: 6px;
  max-width: 360px;
  max-height: 240px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #111827;
  white-space: pre-wrap;
  box-shadow: 0 6px 24px rgba(0,0,0,.16);
}
`;

export class SelectionToolbar {
  private host?: HTMLDivElement;
  private shadow?: ShadowRoot;
  private bar?: HTMLDivElement;
  private resultEl?: HTMLDivElement;
  private currentText = '';
  private anchorRect: Box | null = null;
  private rafPending = false;
  private scrollHandler?: () => void;

  /** 返回挂载点（供“点击外部隐藏”判断） */
  getHost(): HTMLDivElement | undefined {
    return this.host;
  }

  isVisible(): boolean {
    return !!this.host && this.host.style.display !== 'none';
  }

  mount() {
    if (this.host) return;
    const host = document.createElement('div');
    host.id = 'yb-selection-toolbar-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    shadow.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'yb-bar';
    bar.innerHTML = `
      <button data-act="copy">复制</button>
      <button data-act="translate">翻译</button>
      <button data-act="summarize">总结</button>
      <button data-act="capture">截图提问</button>
      <button data-act="ask">问问元宝</button>
    `;
    const result = document.createElement('div');
    result.className = 'yb-result';
    result.style.display = 'none';

    shadow.appendChild(bar);
    shadow.appendChild(result);
    document.documentElement.appendChild(host);

    this.host = host;
    this.shadow = shadow;
    this.bar = bar;
    this.resultEl = result;

    bar.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (btn) this.onAction(btn.getAttribute('data-act'));
    });
  }

  /** 显示工具条并做碰撞避让定位 */
  show(text: string, anchor: Box) {
    this.mount();
    this.currentText = text;
    this.anchorRect = anchor;
    this.clearResult();

    // 先以隐藏态测量真实尺寸，再定位
    const host = this.host!;
    host.style.position = 'fixed';
    host.style.display = 'block';
    host.style.visibility = 'hidden';
    host.style.left = '0px';
    host.style.top = '0px';
    const tb = this.bar!.getBoundingClientRect();

    const placed = computeToolbarPlacement({
      anchor,
      toolbar: { width: tb.width, height: tb.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      obstacles: detectObstacles(document, host),
      gap: 8,
    });
    host.style.left = `${placed.left}px`;
    host.style.top = `${placed.top}px`;
    host.style.visibility = 'visible';

    this.attachScroll();
  }

  hide() {
    if (this.host) this.host.style.display = 'none';
    this.anchorRect = null;
    this.detachScroll();
  }

  /** 选区还在时用已存 anchor 重定位（滚动/视口变化时不遮挡其它弹窗） */
  reposition() {
    if (!this.anchorRect || !this.bar || !this.host || !this.isVisible()) return;
    const tb = this.bar.getBoundingClientRect();
    const placed = computeToolbarPlacement({
      anchor: this.anchorRect,
      toolbar: { width: tb.width, height: tb.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      obstacles: detectObstacles(document, this.host),
      gap: 8,
    });
    this.host.style.left = `${placed.left}px`;
    this.host.style.top = `${placed.top}px`;
  }

  private attachScroll() {
    this.detachScroll();
    const handler = () => {
      if (this.rafPending) return;
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        this.reposition();
      });
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    this.scrollHandler = handler;
  }

  private detachScroll() {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, true);
      window.removeEventListener('resize', this.scrollHandler);
      this.scrollHandler = undefined;
    }
  }

  private onAction(act?: string | null) {
    if (!act || !this.currentText) return;
    if (act === 'copy') {
      copyText(this.currentText);
      this.flash('已复制 ✓');
      return;
    }
    if (act === 'ask') {
      this.askYuanbao();
      return;
    }
    if (act === 'capture') {
      this.captureAndAsk();
      return;
    }
    if (act === 'translate' || act === 'summarize') {
      void this.runTransform(act, this.currentText);
    }
  }

  private async runTransform(task: 'translate' | 'summarize', text: string) {
    this.showResult('…');
    const d = await api.getDefaultModel();
    const model = d.ok && d.defaultModel ? d.defaultModel : '';
    try {
      for await (const c of streamTransform({ task, text, model })) {
        if (c.type === 'chunk') this.appendResult(c.delta);
        else if (c.type === 'error') this.appendResult(`\n[错误] ${c.message}`);
      }
    } catch (e) {
      this.appendResult(`\n[错误] ${(e as Error).message}`);
    } finally {
      // 结果区高度变化后，重新避让定位，避免超出视口或压住别的弹窗
      this.reposition();
    }
  }

  private askYuanbao() {
    try {
      chrome.runtime.sendMessage({ action: 'askYuanbao', text: this.currentText });
    } catch {
      /* ignore */
    }
    this.hide();
  }

  /** 截图提问：截取当前可见页面并写入待问图片，打开侧边栏（视觉问答） */
  private captureAndAsk() {
    try {
      chrome.runtime.sendMessage({ action: 'captureAndAsk', text: this.currentText });
    } catch {
      /* ignore */
    }
    this.hide();
  }

  private clearResult() {
    if (this.resultEl) {
      this.resultEl.style.display = 'none';
      this.resultEl.textContent = '';
    }
  }

  private showResult(text: string) {
    if (this.resultEl) {
      this.resultEl.style.display = 'block';
      this.resultEl.textContent = text;
    }
  }

  private appendResult(delta: string) {
    if (this.resultEl) {
      this.resultEl.style.display = 'block';
      this.resultEl.textContent = (this.resultEl.textContent || '') + delta;
    }
  }

  private flash(text: string) {
    this.showResult(text);
    window.setTimeout(() => this.clearResult(), 1000);
  }
}

/** 复制文本：优先 Clipboard API，失败回退 execCommand */
function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      void navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* fallthrough */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  } catch {
    /* ignore */
  }
}
