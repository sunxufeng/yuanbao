/**
 * 弹出框碰撞避让 —— 纯算法（可单测，不依赖 DOM）。
 *
 * 设计要点（对应需求：“划词弹出框不要遮挡页面已有的其他弹出框”）：
 *  - 给定选区矩形 anchor、工具条尺寸、视口、以及页面中“已存在的弹窗”障碍列表，
 *    计算一个尽量贴近选区、且不与任何障碍重叠的摆放坐标。
 *  - 候选位优先级：上方居中(默认) → 下方居中 → 上方左对齐 → 上方右对齐
 *    → 下方左对齐 → 下方右对齐。评分 = 重叠面积 + 被挤出视口的位移惩罚 + 候选序位微偏置。
 *  - 最终坐标 clamp 进视口，保证工具条始终完整可见。
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 两矩形是否相交（带 0.5px 容差，避免贴边误判重叠） */
export function rectsOverlap(a: Box, b: Box, eps = 0.5): boolean {
  return (
    a.left < b.left + b.width - eps &&
    a.left + a.width > b.left + eps &&
    a.top < b.top + b.height - eps &&
    a.top + a.height > b.top + eps
  );
}

/** 两矩形重叠面积（不相交返回 0） */
export function overlapArea(a: Box, b: Box): number {
  const ix = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const iy = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return ix > 0 && iy > 0 ? ix * iy : 0;
}

/** 将矩形夹回视口内（含 margin），避免越界 */
export function clampToViewport(box: Box, viewport: { width: number; height: number }, margin = 4): Box {
  const left = Math.max(margin, Math.min(box.left, viewport.width - box.width - margin));
  const top = Math.max(margin, Math.min(box.top, viewport.height - box.height - margin));
  return { ...box, left, top };
}

export interface PlacementOptions {
  /** 选区包围盒（视口坐标） */
  anchor: Box;
  /** 工具条自身尺寸（渲染后实测） */
  toolbar: { width: number; height: number };
  /** 视口尺寸 */
  viewport: { width: number; height: number };
  /** 页面中已存在的弹窗障碍 */
  obstacles: Box[];
  /** 与选区的间隙，默认 8 */
  gap?: number;
  /** 视口边距，默认 4 */
  margin?: number;
}

/** 生成 6 个候选摆放位（相对选区） */
function buildCandidates(anchor: Box, t: { width: number; height: number }, gap: number): Box[] {
  const cx = anchor.left + anchor.width / 2;
  const right = anchor.left + anchor.width;
  const above = anchor.top - t.height - gap;
  const below = anchor.top + anchor.height + gap;
  return [
    { left: cx - t.width / 2, top: above, ...t }, // 0 上方居中（默认）
    { left: cx - t.width / 2, top: below, ...t }, // 1 下方居中
    { left: anchor.left, top: above, ...t }, // 2 上方左对齐
    { left: right - t.width, top: above, ...t }, // 3 上方右对齐
    { left: anchor.left, top: below, ...t }, // 4 下方左对齐
    { left: right - t.width, top: below, ...t }, // 5 下方右对齐
  ];
}

/**
 * 计算工具条最终摆放坐标。
 * 返回 { left, top }（视口坐标，已 clamp 进视口）。
 */
export function computeToolbarPlacement(opts: PlacementOptions): { left: number; top: number } {
  const gap = opts.gap ?? 8;
  const margin = opts.margin ?? 4;
  const { anchor, toolbar, viewport, obstacles } = opts;
  const candidates = buildCandidates(anchor, toolbar, gap);

  let best: { box: Box; score: number } | null = null;
  candidates.forEach((c, idx) => {
    const clamped = clampToViewport(c, viewport, margin);
    let overlap = 0;
    for (const o of obstacles) overlap += overlapArea(clamped, o);
    const moved = Math.abs(clamped.left - c.left) + Math.abs(clamped.top - c.top);
    // 重叠最致命；被挤出视口的位移次之；同分时优先靠前的候选（更贴近默认上方）
    const score = overlap + moved * 0.5 + idx * 2;
    if (!best || score < best.score) best = { box: clamped, score };
  });
  return { left: best!.box.left, top: best!.box.top };
}
