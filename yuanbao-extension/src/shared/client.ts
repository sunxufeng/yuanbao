/**
 * 前端（popup / sidepanel / options）与后台通信客户端。
 * 普通请求用 sendMessage；流式 chat / transform 用长连接 Port。
 */
import { PORT_NAME } from './messages';
import type { StreamMessage, ToBackground, FromBackground } from './messages';
import type { ChatRequest, ProviderConfig, ModelEntry, TransformRequest } from '@/types/model';

async function send<T = FromBackground>(msg: ToBackground): Promise<T> {
  return (await chrome.runtime.sendMessage(msg)) as T;
}

export const api = {
  getProviders: () => send<{ ok: true; providers: ProviderConfig[] } & FromBackground>({ action: 'getProviders' }),
  saveProviders: (providers: ProviderConfig[]) =>
    send<{ ok: true; providers: ProviderConfig[] } & FromBackground>({ action: 'saveProviders', providers }),
  getModels: () => send<{ ok: true; models: ModelEntry[] } & FromBackground>({ action: 'getModels' }),
  testProvider: (providerId: string) => send<{ ok: true; tested: boolean } & FromBackground>({ action: 'testProvider', providerId }),
  getDefaultModel: () => send<{ ok: true; defaultModel: string | null } & FromBackground>({ action: 'getDefaultModel' }),
  setDefaultModel: (modelId: string) => send<{ ok: true; defaultModel: string | null } & FromBackground>({ action: 'setDefaultModel', modelId }),
  captureAndAsk: (text?: string) => send<{ ok: true } & FromBackground>({ action: 'captureAndAsk', text }),
  getPageContent: () =>
    send<{ ok: true; title: string; url: string; text: string; articleText?: string } & FromBackground>({ action: 'getPageContent' }),
};

function streamOverPort(action: 'chat' | 'transform', req: ChatRequest | TransformRequest): AsyncGenerator<StreamMessage> {
  return (async function* () {
    const port = chrome.runtime.connect({ name: PORT_NAME });
    const queue: StreamMessage[] = [];
    let resolver: (() => void) | null = null;
    let finished = false;
    port.onMessage.addListener((m: StreamMessage) => {
      queue.push(m);
      if (m.type === 'done') finished = true;
      resolver?.();
    });
    port.postMessage({ action, req });
    while (true) {
      if (queue.length === 0) {
        if (finished) break;
        await new Promise<void>((r) => (resolver = r));
        continue;
      }
      const m = queue.shift()!;
      yield m;
      if (m.type === 'done') break;
    }
    port.disconnect();
  })();
}

export function streamChat(req: ChatRequest): AsyncGenerator<StreamMessage> {
  return streamOverPort('chat', req);
}
export function streamTransform(req: TransformRequest): AsyncGenerator<StreamMessage> {
  return streamOverPort('transform', req);
}
