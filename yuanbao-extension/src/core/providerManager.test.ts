import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fromConfigs } from './providerManager';
import { BUILTIN_PROVIDERS } from './builtinModels';
import type { ProviderConfig } from '@/types/model';

/** 用可控的 fetch 替身构建 OpenAI 兼容 Provider */
function mockOpenAI(text: string) {
  return vi.fn(async () => {
    const body = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}
\ndata: [DONE]\n`;
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  });
}

describe('builtin models', () => {
  it('默认不预置任何 Provider', () => {
    expect(BUILTIN_PROVIDERS).toEqual([]);
  });
});

describe('ProviderManager 路由', () => {
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
    for await (const c of mgr.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })) {
      if (c.delta) out += c.delta;
    }
    expect(out).toContain('你好');
  });

  it('模型出错时直接返回错误，不再自动回退', async () => {
    const broken = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', broken);
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
    const chunks: { delta?: string; error?: string }[] = [];
    for await (const c of mgr.chat({ model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push({ delta: c.delta, error: c.error });
    }
    expect(chunks.some((c) => c.error?.includes('401'))).toBe(true);
    expect(chunks.some((c) => c.delta?.includes('兜底'))).toBe(false);
  });

  it('未选择模型时给出引导错误', async () => {
    const mgr = fromConfigs([]);
    const chunks: { error?: string }[] = [];
    for await (const c of mgr.chat({ model: '', messages: [{ role: 'user', content: 'hi' }] })) {
      chunks.push({ error: c.error });
    }
    expect(chunks[0]?.error).toContain('未选择模型');
  });
});

describe('transform（非 yuanbao 模型）', () => {
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
