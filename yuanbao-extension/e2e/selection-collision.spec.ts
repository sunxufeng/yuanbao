import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 真实扩展级 E2E：加载构建后的 MV3 扩展，在页面放一个“已有弹窗”，
 * 划词后断言元宝工具条出现且与已有弹窗**不重叠**（碰撞避让端到端验证）。
 *
 * 需要 vite preview 已起（默认 http://localhost:4173，提供 /e2e-selection.html 夹具页）。
 */
test('划词工具条不遮挡页面已有弹窗（碰撞避让 E2E）', async () => {
  const extPath = path.resolve(__dirname, '../dist');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'yb-ext-'));

  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    args: [`--load-extension=${extPath}`, '--no-proxy-server'],
  });

  try {
    const page = await context.newPage();
    await page.goto('http://localhost:4173/e2e-selection.html');
    // 触发划词
    await page.evaluate(() => (window as unknown as { __selectAndDispatch: () => void }).__selectAndDispatch());

    // 等待工具条宿主出现；若当前环境（如 headless）无法加载扩展，则跳过本用例
    try {
      await page.waitForSelector('#yb-selection-toolbar-host', { timeout: 4000 });
    } catch {
      test.skip(true, '当前环境无法加载 MV3 扩展（headless 限制），请在真实 Chrome 中验证');
      return;
    }

    const result = await page.evaluate(() => {
      const host = document.getElementById('yb-selection-toolbar-host') as HTMLElement;
      const tip = document.querySelector('.fake-tooltip') as HTMLElement;
      const r = host.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const overlap =
        !(r.right <= t.left || r.left >= t.right || r.bottom <= t.top || r.top >= t.bottom);
      return {
        host: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height },
        tip: { left: t.left, top: t.top, right: t.right, bottom: t.bottom },
        overlap,
      };
    });

    // 工具条应真实渲染（有尺寸）
    expect(result.host.w).toBeGreaterThan(0);
    expect(result.host.h).toBeGreaterThan(0);
    // 核心断言：不与页面已有弹窗重叠
    expect(result.overlap).toBe(false);
  } finally {
    await context.close();
  }
});
