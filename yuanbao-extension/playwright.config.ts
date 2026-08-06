import { defineConfig } from '@playwright/test';

/**
 * E2E 配置（T11 测试覆盖）
 *  - 用 vite preview 静态托管已构建的 dist（options 页引用 /assets 绝对路径）。
 *  - 真实无头 Chromium 运行；扩展私有 API 通过 addInitScript 注入 mock chrome，
 *    在真实 DOM 中验证 UI 交互（无需真机扩展运行时）。
 *  - webServer 由本机命令手动拉起（见 npm run e2e 说明），避免沙箱代理影响 localhost 探测；
 *    浏览器加 --no-proxy-server 确保直连 localhost。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    launchOptions: {
      args: ['--no-proxy-server', '--no-sandbox'],
    },
  },
});

