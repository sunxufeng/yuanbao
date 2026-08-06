import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fromConfigs } from './providerManager';
import { BUILTIN_PROVIDERS } from './builtinModels';
import type { ProviderConfig } from '@/types/model';

/** 用可控的 fetch 替身构建 OpenAI 兼容 Provider */
function mockOpenAI(text: string) {
  return vi.fn(async () => {
    const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n`;
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
}

describe('builtin models', () => {
  it('包含 yuanbao 与多个常用模型 Provider', () => {
    expect(BUILTIN_PROVIDERS.some((p) => p.id === 'yuanbao')).toBe(true);
    expect(BUILTIN_PROVIDERS.some((p) => p.id === 'openai')).toBe(true);
    expect(BUILTIN_PROVIDERS.some((p) => p.id === 'ollama')).toBe(true);
  });
});

describe('ProviderManager 路由与回退', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('正常模型返回流式内容', async () => {
    const fetchMock = mockOpenAI('你好');
    vi.stubGlobal('fetch', fetchMock);
    const mgr = fromConfigs([
      {
        id: 'openai',
        type: 'openai-compatible',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        enabled: true,
        models: [{ id: 'gpt-4o', label: 'GPT-4o', providerId: 'openai', capability: ['chat'] }],
      },
    ]);
    let out = '';
    for await (const c of mgr.chatWithFallback({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })) {
      if (c.delta) out += c.delta;
    }
    expect(out).toContain('你好');
  });

  it('不可达模型回退到内置 yuanbao', async () => {
    const broken = vi.fn(async () => new Response('', { status: 500 }));
    const yuanbaoFetch = mockOpenAI('兜底回复');
    vi.stubGlobal('fetch', (input: any) => {
      const url = String(input);
      return url.includes('yuanbao') ? yuanbaoFetch() : broken();
    });
    const mgr = fromConfigs([
      {
        id: 'openai',
        type: 'openai-compatible',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        enabled: true,
        models: [{ id: 'gpt-4o', label: 'GPT-4o', providerId: 'openai', capability: ['chat'] }],
      },
      {
        id: 'yuanbao',
        type: 'yuanbao',
        name: '元宝',
        baseURL: 'https://yuanbao.tencent.com',
        apiKey: 'tok',
        enabled: true,
        models: [{ id: 'yuanbao-hunyuan', label: '混元', providerId: 'yuanbao', capability: ['chat'] }],
      },
    ]);
    let out = '';
    for await (const c of mgr.chatWithFallback({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })) {
      if (c.delta) out += c.delta;
    }
    expect(out).toContain('兜底回复');
  });
});

describe('transform 降级（非 yuanbao 模型）', () => {
  it('非元宝模型走 chat + 专用 prompt', async () => {
    const fetchMock = mockOpenAI('译文内容');
    vi.stubGlobal('fetch', fetchMock);
    const mgr = fromConfigs([
      {
        id: 'openai',
        type: 'openai-compatible',
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        enabled: true,
        models: [{ id: 'gpt-4o', label: 'GPT-4o', providerId: 'openai', capability: ['chat'] }],
      },
    ]);
    let out = '';
    for await (const c of mgr.transform({ task: 'translate', text: 'hello', model: 'gpt-4o' })) {
      if (c.delta) out += c.delta;
    }
    expect(out).toContain('译文内容');
    // 验证 prompt 降级：请求体里包含翻译指令
    const calledBody = JSON.parse(((fetchMock as any).mock.calls[0][1]).body);
    expect(calledBody.messages[0].content).toContain('翻译');
  });
});
