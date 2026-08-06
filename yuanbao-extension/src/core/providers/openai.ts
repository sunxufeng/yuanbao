/**
 * OpenAI 兼容 Provider（含 Anthropic 方言兼容）
 *
 * 覆盖：OpenAI / DeepSeek 官方 / 通义 Qwen / 智谱 GLM / Kimi / Gemini(OpenAI 兼容端点) / 本地 Ollama。
 * Claude 走 Anthropic 原生协议（extInfo.dialect === 'anthropic'），由本类内部兼容，
 * 这样既能保持“统一 OpenAI 兼容抽象”，又能让 Claude 真正可用（Anthropic 原生 API 非 OpenAI 格式）。
 */
import type { ChatChunk, ChatRequest, ModelEntry, ProviderConfig } from '@/types/model';
import { BaseProvider } from './base';

function resolveApiModel(modelId: string, extInfo?: Record<string, unknown>): string {
  return (extInfo?.apiModel as string) || modelId;
}

export class OpenAICompatibleProvider extends BaseProvider {
  id = this.cfg.id;
  // 跟随配置类型：builtin openai-compatible 为 'openai-compatible'，用户自定义为 'custom'
  type = this.cfg.type;
  name = this.cfg.name;

  private isAnthropic(): boolean {
    return this.cfg.models?.some((m) => m.extInfo?.dialect === 'anthropic') ||
      (this.cfg as any)._dialect === 'anthropic';
  }

  private async *streamOpenAI(req: ChatRequest, apiModel: string): AsyncIterable<ChatChunk> {
    const url = `${this.baseURL?.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: apiModel,
      messages: req.messages,
      stream: true,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      yield { delta: '', error: `HTTP ${res.status} ${res.statusText}` };
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        if (data === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta: string = json.choices?.[0]?.delta?.content ?? '';
          if (delta) yield { delta };
        } catch {
          /* 忽略非 JSON 行 */
        }
      }
    }
    yield { delta: '', done: true };
  }

  private async *streamAnthropic(req: ChatRequest, apiModel: string): AsyncIterable<ChatChunk> {
    const url = `${this.baseURL?.replace(/\/$/, '')}/messages`;
    const system = req.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    const messages = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : m.content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: (p as any).image_url.url } })),
      }));
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: apiModel,
        system: system || undefined,
        messages,
        max_tokens: req.maxTokens ?? 2048,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      yield { delta: '', error: `HTTP ${res.status} ${res.statusText}` };
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith('data:')) continue;
        const data = l.slice(5).trim();
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            yield { delta: json.delta.text };
          } else if (json.type === 'message_stop') {
            yield { delta: '', done: true };
            return;
          }
        } catch {
          /* 忽略 */
        }
      }
    }
    yield { delta: '', done: true };
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    const entry = this.cfg.models.find((m) => m.id === req.model);
    const apiModel = resolveApiModel(req.model, entry?.extInfo);
    if (this.isAnthropic()) {
      yield* this.streamAnthropic(req, apiModel);
    } else {
      yield* this.streamOpenAI(req, apiModel);
    }
  }

  async test(): Promise<boolean> {
    try {
      const url = `${this.baseURL?.replace(/\/$/, '')}/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey ?? ''}`,
        },
        body: JSON.stringify({
          model: resolveApiModel(this.cfg.models[0]?.id ?? 'gpt-4o', this.cfg.models[0]?.extInfo),
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
      });
      return res.status < 500;
    } catch {
      return false;
    }
  }
}
