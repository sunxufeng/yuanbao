/**
 * Provider 管理器（第 11.3 / 11.4 章）
 *  - 由 ProviderConfig 实例化为运行时 ModelProvider；
 *  - 合并“启用 Provider”的模型清单，供选择器展示；
 *  - 对话按 ModelEntry.providerId 路由；Provider 不可达时回退默认模型（复用 ModelSwitchErrorTip 思路）；
 *  - 翻译/总结：元宝走专用 endpoint，其余模型“chat + 专用 prompt”降级，保证功能不缺失。
 */
import type { ChatChunk, ChatRequest, ModelEntry, ModelProvider, ProviderConfig, TransformRequest } from '@/types/model';
import { getProviders } from './storage';
import { track } from './analytics';
import { YuanBaoProvider } from './providers/yuanbao';
import { OpenAICompatibleProvider } from './providers/openai';
import { CustomProvider } from './providers/custom';

/** 把底层 HTTP 错误包装成用户能看懂的提示 */
function formatProviderError(raw: string, providerName: string): string {
  const s = raw.trim() || '未知错误';
  let hint = '';
  if (/\b401\b|Unauthorized|invalid_api_key|Incorrect API key/i.test(s)) {
    hint = '请检查 API Key 是否正确，或该 Key 是否有调用此模型的权限。';
  } else if (/\b404\b|Not Found/i.test(s)) {
    hint = '请检查 Base URL 与模型 ID 是否匹配。';
  } else if (/\b429\b|Too Many Requests|rate limit/i.test(s)) {
    hint = '请求过于频繁或额度不足，请稍后重试。';
  } else if (/\b50[0-9]\b|ETIMEDOUT|ECONNREFUSED|NetworkError|Failed to fetch/i.test(s)) {
    hint = '服务端暂时不可用或网络受限，请检查网络与代理设置。';
  } else if (/CORS|cross-origin|blocked by/i.test(s)) {
    hint = '请求被浏览器拦截。请确认 Base URL 支持跨域，或改用 HTTPS 端点。';
  }
  return `[${providerName}] ${s}${hint ? '\n' + hint : ''}`;
}

function instantiate(cfg: ProviderConfig): ModelProvider {
  switch (cfg.type) {
    case 'yuanbao':
      return new YuanBaoProvider(cfg);
    case 'custom':
      return new CustomProvider(cfg);
    case 'openai-compatible':
    default:
      return new OpenAICompatibleProvider(cfg);
  }
}

export class ProviderManager {
  private providers: ModelProvider[] = [];
  private configs: ProviderConfig[] = [];

  async init(): Promise<this> {
    this.configs = await getProviders();
    this.providers = this.configs.filter((c) => c.enabled).map(instantiate);
    return this;
  }

  /** 所有启用 Provider 的模型清单（供 UI 选择器） */
  listModels(): ModelEntry[] {
    return this.listModelsSync();
  }

  /** 同步取模型（list 是 async，这里用 configs 直接算，避免 await 抖动） */
  listModelsSync(): ModelEntry[] {
    return this.configs.filter((c) => c.enabled).flatMap((c) => c.models ?? []);
  }

  private resolve(modelId: string): { provider: ModelProvider; entry: ModelEntry } | null {
    for (const p of this.providers) {
      const entry = (p as any).cfg?.models?.find((m: ModelEntry) => m.id === modelId);
      if (entry) return { provider: p, entry };
    }
    // 兜底从 configs 找
    for (const c of this.configs) {
      const entry = c.models?.find((m) => m.id === modelId);
      if (entry) return { provider: instantiate(c), entry };
    }
    return null;
  }

  /** 对话：直接路由到用户选中的模型，出错即停并给出可操作的提示 */
  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    void track('model_used');
    if (!req.model) {
      yield { delta: '', error: '未选择模型。请先在设置中添加并启用一个 Provider，然后选择默认模型。' };
      yield { delta: '', done: true };
      return;
    }
    const resolved = this.resolve(req.model);
    if (!resolved) {
      yield { delta: '', error: `未知模型：${req.model}。请检查该模型是否已被禁用或删除。` };
      yield { delta: '', done: true };
      return;
    }
    for await (const c of resolved.provider.chat(req)) {
      if (c.error) {
        yield { delta: '', error: formatProviderError(c.error, resolved.provider.name) };
        break;
      }
      yield c;
    }
    yield { delta: '', done: true };
  }

  /** 旧名保留兼容，行为与 chat 相同（不再自动回退） */
  async *chatWithFallback(req: ChatRequest): AsyncIterable<ChatChunk> {
    yield* this.chat(req);
  }

  /** 翻译/总结：统一走 chat + 专用 prompt，出错直接返回格式化错误 */
  async *transform(req: TransformRequest): AsyncIterable<ChatChunk> {
    if (!req.model) {
      yield { delta: '', error: '未选择模型。请先在设置中添加并启用一个 Provider，然后选择默认模型。' };
      yield { delta: '', done: true };
      return;
    }
    const resolved = this.resolve(req.model);
    if (!resolved) {
      yield { delta: '', error: `未知模型：${req.model}。请检查该模型是否已被禁用或删除。` };
      yield { delta: '', done: true };
      return;
    }
    void track('transform_degraded');
    const prompt =
      req.task === 'translate'
        ? `请将以下内容翻译为${req.targetLang || '中文'}，仅输出译文，不要解释：\n\n${req.text}`
        : `请用简洁的中文总结以下内容，保留关键要点，不要添加额外评论：\n\n${req.text}`;
    for await (const c of resolved.provider.chat({ model: req.model, messages: [{ role: 'user', content: prompt }], stream: true })) {
      if (c.error) {
        yield { delta: '', error: formatProviderError(c.error, resolved.provider.name) };
        break;
      }
      yield c;
    }
    yield { delta: '', done: true };
  }

  async testProvider(providerId: string): Promise<boolean> {
    const p = this.providers.find((x) => (x as any).id === providerId);
    if (!p) return false;
    return p.test();
  }
}

// 单例
let _mgr: ProviderManager | null = null;
export async function getManager(): Promise<ProviderManager> {
  if (!_mgr) _mgr = await new ProviderManager().init();
  return _mgr;
}

/** 测试 / 运行时直接由配置构造（不触达 chrome.storage） */
export function fromConfigs(configs: ProviderConfig[]): ProviderManager {
  const m = new ProviderManager();
  (m as unknown as { configs: ProviderConfig[] }).configs = configs;
  (m as unknown as { providers: ModelProvider[] }).providers = configs.filter((c) => c.enabled).map(instantiate);
  return m;
}
