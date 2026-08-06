// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { detectObstacles } from './obstacles';

function fakeRect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({ left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect);
}

beforeEach(() => {
  document.body.innerHTML = '';
  // jsdom 默认 innerWidth/innerHeight
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
});

describe('detectObstacles 页面弹窗探测', () => {
  it('识别页面 tooltip 浮层', () => {
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.style.position = 'fixed';
    tip.style.left = '10px';
    tip.style.top = '10px';
    tip.style.width = '80px';
    tip.style.height = '30px';
    document.body.appendChild(tip);
    fakeRect(tip, { left: 10, top: 10, width: 80, height: 30 });

    const obs = detectObstacles();
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ left: 10, top: 10, width: 80, height: 30 });
  });

  it('整屏级大容器不算障碍', () => {
    const big = document.createElement('div');
    big.style.position = 'fixed';
    big.style.left = '0px';
    big.style.top = '0px';
    big.style.width = '2000px';
    big.style.height = '1000px';
    document.body.appendChild(big);
    fakeRect(big, { left: 0, top: 0, width: 2000, height: 1000 });

    expect(detectObstacles()).toHaveLength(0);
  });

  it('高 z-index 浮层（含其它扩展注入）被兜底捕获', () => {
    const ext = document.createElement('div');
    ext.style.position = 'fixed';
    ext.style.left = '500px';
    ext.style.top = '40px';
    ext.style.width = '120px';
    ext.style.height = '60px';
    ext.style.zIndex = '2147483600';
    document.body.appendChild(ext);
    fakeRect(ext, { left: 500, top: 40, width: 120, height: 60 });

    const obs = detectObstacles();
    expect(obs.some((o) => o.left === 500 && o.top === 40)).toBe(true);
  });

  it('排除参数指定的元素（避免工具条把自己当障碍）', () => {
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.style.position = 'fixed';
    tip.style.left = '10px';
    tip.style.top = '10px';
    tip.style.width = '80px';
    tip.style.height = '30px';
    document.body.appendChild(tip);
    fakeRect(tip, { left: 10, top: 10, width: 80, height: 30 });

    const self = document.createElement('div');
    self.style.position = 'fixed';
    self.style.left = '300px';
    self.style.top = '300px';
    self.style.width = '160px';
    self.style.height = '40px';
    document.body.appendChild(self);
    fakeRect(self, { left: 300, top: 300, width: 160, height: 40 });

    const obs = detectObstacles(document, self);
    expect(obs).toHaveLength(1);
    expect(obs[0].left).toBe(10);
  });
});
