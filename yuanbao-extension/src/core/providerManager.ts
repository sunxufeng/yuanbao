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

  /** 默认回退 Provider（优先内置 yuanbao，否则第一个启用的 openai-compatible） */
  private fallbackFor(excludeId: string): { provider: ModelProvider; modelId: string } | null {
    const yuanbao = this.providers.find((p) => p.type === 'yuanbao' && (p as any).id !== excludeId);
    if (yuanbao) {
      const m = ((yuanbao as any).cfg?.models ?? [])[0];
      if (m) return { provider: yuanbao, modelId: m.id };
    }
    const alt = this.providers.find((p) => (p as any).id !== excludeId);
    if (alt) {
      const m = ((alt as any).cfg?.models ?? [])[0];
      if (m) return { provider: alt, modelId: m.id };
    }
    return null;
  }

  /** 对话（带一次回退） */
  async *chatWithFallback(req: ChatRequest): AsyncIterable<ChatChunk> {
    void track('model_used');
    const resolved = this.resolve(req.model);
    if (!resolved) {
      yield { delta: '', error: `未知模型：${req.model}` };
      yield { delta: '', done: true };
      return;
    }
    let errored = false;
    for await (const c of resolved.provider.chat(req)) {
      if (c.error) {
        errored = true;
        yield { delta: '', error: c.error };
        break;
      }
      yield c;
    }
    if (errored) {
      const fb = this.fallbackFor((resolved.provider as any).id);
      if (fb) {
        void track('model_fallback');
        yield { delta: `\n\n[当前模型不可用，已回退至 ${fb.provider.name}]\n` };
        for await (const c of fb.provider.chat({ ...req, model: fb.modelId })) {
          if (c.error) {
            yield { delta: '', error: c.error };
            break;
          }
          yield c;
        }
      }
    }
    yield { delta: '', done: true };
  }

  /** 翻译/总结（元宝专用 + 其它模型 prompt 降级） */
  async *transform(req: TransformRequest): AsyncIterable<ChatChunk> {
    const resolved = this.resolve(req.model);
    if (!resolved) {
      yield { delta: '', error: `未知模型：${req.model}` };
      yield { delta: '', done: true };
      return;
    }
    if (resolved.provider.type === 'yuanbao') {
      yield* this.yuanbaoTransform(req);
      return;
    }
    // 降级：chat + 专用 prompt（埋点记录降级次数）
    void track('transform_degraded');
    const prompt =
      req.task === 'translate'
        ? `请将以下内容翻译为${req.targetLang || '中文'}，仅输出译文，不要解释：\n\n${req.text}`
        : `请用简洁的中文总结以下内容，保留关键要点，不要添加额外评论：\n\n${req.text}`;
    yield* resolved.provider.chat({ model: req.model, messages: [{ role: 'user', content: prompt }], stream: true });
  }

  private async *yuanbaoTransform(req: TransformRequest): AsyncIterable<ChatChunk> {
    const provider = this.providers.find((p) => p.type === 'yuanbao') as YuanBaoProvider | undefined;
    const cfg = this.configs.find((c) => c.type === 'yuanbao');
    if (!provider || !cfg) {
      yield { delta: '', error: '未配置元宝 Provider' };
      yield { delta: '', done: true };
      return;
    }
    const base = (cfg.baseURL || 'https://yuanbao.tencent.com').replace(/\/$/, '');
    const endpoint = `${base}/api/translate`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey ?? ''}`,
        },
        body: JSON.stringify({ model: 'hunyuan-translation', text: req.text, target_lang: req.targetLang || 'zh' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      yield { delta: json.translation || json.result || '' };
    } catch {
      // 元宝翻译不可用时，降级到该模型的 chat 总结/翻译
      const prompt =
        req.task === 'translate'
          ? `请将以下内容翻译为${req.targetLang || '中文'}，仅输出译文：\n\n${req.text}`
          : `请总结以下内容：\n\n${req.text}`;
      yield* provider.chat({ model: req.model, messages: [{ role: 'user', content: prompt }], stream: true });
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
