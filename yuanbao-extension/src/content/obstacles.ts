/**
 * 页面“已有弹窗”探测（碰撞避让的数据来源）。
 *
 * 目标：在不依赖具体站点结构的前提下，找出页面上已经显示着的浮动弹窗
 * （页面自带 tooltip / menu / toast，以及其他扩展注入的浮层），
 * 让划词工具条避开它们，不造成遮挡。
 *
 * 启发式（兼顾准确率与性能）：
 *  1) 命中常见弹窗语义/类名选择器（role=tooltip/menu/dialog、.tooltip/.popover/.toast 等）；
 *  2) 再补一遍“高 z-index 的 fixed/absolute 元素”扫描，兜底捕获其它扩展的浮层；
 *  3) 过滤：不可见、零尺寸、超出视口、或整屏级大元素（通常是要避让的目标而非障碍）。
 */

import type { Box } from './positioning';

/** 常见弹窗/浮层选择器 */
const POPUP_SELECTORS = [
  '[role="tooltip"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[role="alert"]',
  '[role="alertdialog"]',
  '.tooltip',
  '.popover',
  '[data-popover]',
  '[class*="tooltip" i]',
  '[class*="popover" i]',
  '[class*="toast" i]',
  '[class*="dropdown" i]',
  '[class*="notification" i]',
  '[class*="bubble" i]',
];

/** 尺寸上限：超过则视为整屏级容器，不作为障碍 */
const MAX_W = 520;
const MAX_H = 360;
/** 高 z-index 阈值：达到则无论尺寸都视为潜在浮层（兜底其他扩展） */
const HIGH_Z = 1000;

export function detectObstacles(root: Document = document, exclude?: Element): Box[] {
  const out: Box[] = [];
  const seen = new Set<Element>();

  const consider = (el: Element) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    if (exclude && (el === exclude || exclude.contains(el))) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    if (rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) return;
    const z = parseInt(cs.zIndex || '0', 10);
    const small = rect.width <= MAX_W && rect.height <= MAX_H;
    const highZ = z >= HIGH_Z;
    if (small || highZ) {
      out.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    }
  };

  for (const sel of POPUP_SELECTORS) {
    try {
      root.querySelectorAll(sel).forEach(consider);
    } catch {
      /* 忽略单个选择器异常 */
    }
  }

  // 兜底：高 z-index 的浮动元素（其他扩展常把浮层 z-index 拉得很高）
  try {
    root.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        const z = parseInt(cs.zIndex || '0', 10);
        if (z >= HIGH_Z) consider(el);
      }
    });
  } catch {
    /* 忽略 */
  }

  return out;
}
