// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionToolbar } from './selectionToolbar';

function setRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect);
}

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});

/** 读取工具条宿主的摆放坐标（show 后写入 style.left/top，单位 px） */
function hostPos(tb: SelectionToolbar) {
  const host = tb.getHost()!;
  return { left: parseFloat(host.style.left), top: parseFloat(host.style.top) };
}

describe('SelectionToolbar 碰撞避让（集成）', () => {
  it('无障碍时工具条默认置于选区上方居中', () => {
    const tb = new SelectionToolbar();
    tb.mount();
    const bar = tb.getHost()!.shadowRoot!.querySelector('.yb-bar') as HTMLElement;
    setRect(bar, { left: 0, top: 0, width: 160, height: 40 });
    tb.show('hello', { left: 100, top: 200, width: 200, height: 20 });
    const { left, top } = hostPos(tb);
    expect(left).toBeCloseTo(120, 0); // 100 + 100 - 80
    expect(top).toBeCloseTo(152, 0); // 200 - 40 - 8
  });

  it('上方有页面弹窗时自动下沉到下方，且不重叠', () => {
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.style.position = 'fixed';
    tip.style.left = '110px';
    tip.style.top = '150px';
    tip.style.width = '180px';
    tip.style.height = '30px';
    tip.style.zIndex = '9999';
    document.body.appendChild(tip);
    setRect(tip, { left: 110, top: 150, width: 180, height: 30 });

    const tb = new SelectionToolbar();
    tb.mount();
    const bar = tb.getHost()!.shadowRoot!.querySelector('.yb-bar') as HTMLElement;
    setRect(bar, { left: 0, top: 0, width: 160, height: 40 });
    tb.show('hello', { left: 100, top: 200, width: 200, height: 20 });

    const { left, top } = hostPos(tb);
    const box = { left, top, w: 160, h: 40 };
    const overlap =
      !(box.left + box.w <= 110 || box.left >= 290 || box.top + box.h <= 150 || box.top >= 180);
    expect(overlap).toBe(false); // 不与页面已有弹窗重叠
    expect(top).toBeGreaterThan(220); // 落在选区下方
  });

  it('不把自身（工具条宿主）当作障碍', () => {
    const tb = new SelectionToolbar();
    tb.mount();
    const bar = tb.getHost()!.shadowRoot!.querySelector('.yb-bar') as HTMLElement;
    setRect(bar, { left: 0, top: 0, width: 160, height: 40 });
    // 仅在页面放一个无关弹窗，工具条应正常出现在上方居中，不会因“自己”被排除而报错
    const tip = document.createElement('div');
    tip.className = 'toast';
    tip.style.position = 'fixed';
    tip.style.left = '600px';
    tip.style.top = '600px';
    tip.style.width = '120px';
    tip.style.height = '40px';
    document.body.appendChild(tip);
    setRect(tip, { left: 600, top: 600, width: 120, height: 40 });

    tb.show('hello', { left: 100, top: 200, width: 200, height: 20 });
    const { left, top } = hostPos(tb);
    expect(left).toBeCloseTo(120, 0);
    expect(top).toBeCloseTo(152, 0);
  });
});
