import { test, expect } from '@playwright/test';

/**
 * Options 页 E2E（T11）
 * 注入 mock chrome.runtime.sendMessage，覆盖 options 页两条核心路径：
 *  1) 加载时渲染预置 Provider 列表与默认模型；
 *  2) 新增自定义 Provider 并保存成功。
 * 说明：options 页仅依赖 runtime.sendMessage，无需真实后台/扩展运行时。
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const providers = [
      {
        id: 'yuanbao',
        type: 'yuanbao',
        name: '元宝（腾讯混元）',
        baseURL: 'https://yuanbao.tencent.com',
        enabled: true,
        builtin: true,
        models: [{ id: 'yuanbao-hunyuan', label: '混元 Hunyuan', providerId: 'yuanbao', capability: ['chat', 'vision', 'translate'] }],
      },
      {
        id: 'openai',
        type: 'openai-compatible',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        enabled: true,
        builtin: true,
        models: [{ id: 'gpt-4o', label: 'GPT-4o', providerId: 'openai', capability: ['chat', 'vision'] }],
      },
      {
        id: 'deepseek',
        type: 'openai-compatible',
        name: 'DeepSeek 官方',
        baseURL: 'https://api.deepseek.com/v1',
        enabled: true,
        builtin: true,
        models: [{ id: 'deepseek-chat', label: 'DeepSeek V3 (chat)', providerId: 'deepseek', capability: ['chat'] }],
      },
    ];
    // @ts-ignore
    (window as any).chrome = {
      runtime: {
        sendMessage: async (msg: any) => {
          switch (msg.action) {
            case 'getProviders':
              return { ok: true, providers: JSON.parse(JSON.stringify(providers)) };
            case 'getDefaultModel':
              return { ok: true, defaultModel: 'yuanbao-hunyuan' };
            case 'saveProviders':
              return { ok: true, providers: msg.providers };
            case 'setDefaultModel':
              return { ok: true, defaultModel: msg.modelId };
            case 'testProvider':
              return { ok: true, tested: true };
            default:
              return { ok: false, error: 'unknown action' };
          }
        },
        connect: () => ({ postMessage() {}, onMessage: { addListener() {} }, disconnect() {} }),
        lastError: null,
      },
    };
  });
});

test('options 页渲染预置 Provider 与默认模型', async ({ page }) => {
  await page.goto('/src/options/index.html');
  await expect(page.getByText('元宝 AI 助手 · 模型设置')).toBeVisible();
  // 用 data-testid + toHaveValue 精确校验（受控输入框 value 走属性，toHaveValue 最稳）
  await expect(page.getByTestId('provider-name-yuanbao')).toHaveValue('元宝（腾讯混元）');
  await expect(page.getByTestId('provider-name-openai')).toHaveValue('OpenAI');
  await expect(page.getByTestId('provider-name-deepseek')).toHaveValue('DeepSeek 官方');
  // 默认模型下拉包含混元
  await expect(page.locator('select')).toContainText('混元 Hunyuan');
});

test('新增自定义 Provider 并保存', async ({ page }) => {
  await page.goto('/src/options/index.html');
  const cards = page.getByTestId('provider-card');
  const before = await cards.count();
  await page.getByRole('button', { name: '+ 新增自定义' }).click();
  // 卡片数 +1，新卡片首输入框（名称）默认值为“自定义端点”
  await expect(cards).toHaveCount(before + 1);
  await expect(cards.last().locator('input').first()).toHaveValue('自定义端点');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('已保存 ✓')).toBeVisible();
});
