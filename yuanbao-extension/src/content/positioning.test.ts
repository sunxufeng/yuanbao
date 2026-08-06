import { describe, it, expect } from 'vitest';
import { computeToolbarPlacement, rectsOverlap, overlapArea, clampToViewport } from './positioning';

describe('positioning 工具函数', () => {
  it('rectsOverlap / overlapArea 基本正确', () => {
    const a = { left: 0, top: 0, width: 100, height: 100 };
    const b = { left: 50, top: 50, width: 100, height: 100 };
    expect(rectsOverlap(a, b)).toBe(true);
    expect(overlapArea(a, b)).toBe(50 * 50);
    const c = { left: 200, top: 200, width: 10, height: 10 };
    expect(rectsOverlap(a, c)).toBe(false);
    expect(overlapArea(a, c)).toBe(0);
  });

  it('clampToViewport 把越界矩形夹回', () => {
    const r = clampToViewport({ left: -10, top: 5, width: 100, height: 40 }, { width: 1000, height: 800 }, 4);
    expect(r.left).toBe(4);
    expect(r.top).toBe(5);
  });
});

describe('computeToolbarPlacement 碰撞避让', () => {
  const anchor = { left: 100, top: 200, width: 200, height: 20 };
  const toolbar = { width: 160, height: 40 };
  const viewport = { width: 1000, height: 800 };

  it('无障碍时默认放在选区上方居中', () => {
    const p = computeToolbarPlacement({ anchor, toolbar, viewport, obstacles: [] });
    // 上方居中：left = 100 + 100 - 80 = 120；top = 200 - 40 - 8 = 152
    expect(p.left).toBe(120);
    expect(p.top).toBe(152);
  });

  it('上方有弹窗时自动下沉到下方居中', () => {
    const obstacles = [{ left: 110, top: 150, width: 180, height: 30 }];
    const p = computeToolbarPlacement({ anchor, toolbar, viewport, obstacles });
    // 下方居中：top = 200 + 20 + 8 = 228
    expect(p.top).toBe(228);
    expect(p.left).toBe(120);
  });

  it('上下都被遮挡时，落到重叠面积最小的候选位', () => {
    const obstacles = [
      { left: 110, top: 150, width: 180, height: 30 }, // 上方
      { left: 110, top: 225, width: 180, height: 30 }, // 下方
    ];
    const p = computeToolbarPlacement({ anchor, toolbar, viewport, obstacles });
    // 至少仍在视口内，且不会“完好无重叠”地落在上方候选（上方必然重叠）
    expect(p.top).toBeGreaterThanOrEqual(4);
    expect(p.left).toBeGreaterThanOrEqual(4);
    // 命中位置必与某个障碍有重叠（因为无法完全避开），但应被 clamp 进视口
    const hitAny = obstacles.some((o) => rectsOverlap({ left: p.left, top: p.top, ...toolbar }, o));
    expect(hitAny).toBe(true);
  });

  it('贴近视口左边时不被推出界（clamp）', () => {
    const a = { left: 0, top: 200, width: 50, height: 20 };
    const p = computeToolbarPlacement({ anchor: a, toolbar, viewport, obstacles: [] });
    expect(p.left).toBe(4); // 上方居中 left = 25 - 80 = -55 → clamp 到 4
  });

  it('窄视口下工具条仍保持完整可见', () => {
    const smallVP = { width: 200, height: 400 };
    const p = computeToolbarPlacement({
      anchor: { left: 20, top: 100, width: 40, height: 20 },
      toolbar: { width: 180, height: 40 },
      viewport: smallVP,
      obstacles: [],
    });
    const box = { left: p.left, top: p.top, ...toolbar };
    expect(box.left).toBeGreaterThanOrEqual(4);
    expect(box.left + box.width).toBeLessThanOrEqual(200 - 4 + 0.5);
    expect(box.top).toBeGreaterThanOrEqual(4);
    expect(box.top + box.height).toBeLessThanOrEqual(400 - 4 + 0.5);
  });
});
