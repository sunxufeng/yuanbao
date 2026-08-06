import type { ChatChunk, ChatRequest, ModelEntry, ModelProvider, ProviderConfig } from '@/types/model';

/** 统一的 SSE 行解析：把文本流切成事件块（兼容 OpenAI / Anthropic 风格） */
export function* parseSSE(raw: string): Generator<{ event?: string; data: string }> {
  let buffer = '';
  for (const ch of raw) {
    buffer += ch;
    if (buffer.endsWith('\n')) {
      const line = buffer.replace(/\n$/, '');
      buffer = '';
      if (line.startsWith('event:')) {
        // 事件名单独成行，下一行是 data；这里先透传事件名
        const event = line.slice(6).trim();
        yield { event, data: '' };
      } else if (line.startsWith('data:')) {
        yield { data: line.slice(5).trim() };
      } else if (line === 'data') {
        yield { data: '' };
      }
    }
  }
  if (buffer.trim()) {
    if (buffer.startsWith('data:')) yield { data: buffer.slice(5).trim() };
  }
}

export abstract class BaseProvider implements ModelProvider {
  constructor(protected cfg: ProviderConfig) {}
  abstract id: string;
  abstract type: ProviderConfig['type'];
  abstract name: string;

  async list(): Promise<ModelEntry[]> {
    return this.cfg.models ?? [];
  }

  abstract chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  abstract test(): Promise<boolean>;

  protected get apiKey(): string | undefined {
    return this.cfg.apiKey;
  }
  protected get baseURL(): string | undefined {
    return this.cfg.baseURL;
  }
}
