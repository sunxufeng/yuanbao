/**
 * 元宝内置 Provider（保留现有腾讯网关形态）
 *
 * 说明（重要）：原 1.0.16 插件调用强耦合腾讯元宝网关，鉴权依赖登录态（X-Instance-ID、device-id 等），
 * 这些凭证来自用户在 yuanbao.tencent.com 的登录 session，无法在离线脚手架里逆向还原。
 * 因此本 Provider 设计为“读取用户在 options 页配置的元宝会话令牌（若有）+ 默认网关”，
 * 并预留 extInfo 透传腾讯专属头；缺失凭证时返回明确错误，由 ProviderManager 兜底回退到其它模型。
 *
 * 翻译/总结走元宝专用 endpoint（model: 'hunyuan-translation'），由 background 路由层处理。
 */
import type { ChatChunk, ChatRequest, ModelEntry, ProviderConfig } from '@/types/model';
import { BaseProvider } from './base';
import { DEFAULT_YUANBAO_BASEURL } from '../builtinModels';

export class YuanBaoProvider extends BaseProvider {
  id = this.cfg.id;
  type: ProviderConfig['type'] = 'yuanbao';
  name = this.cfg.name;

  private endpoint(): string {
    const base = (this.baseURL || DEFAULT_YUANBAO_BASEURL).replace(/\/$/, '');
    return `${base}/api/chat/completions`;
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatChunk> {
    if (!this.apiKey) {
      yield { delta: '', error: '未配置元宝会话令牌（请在选项页“元宝”中填写），或当前未登录元宝网页。' };
      return;
    }
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: true,
          max_tokens: req.maxTokens ?? 2048,
        }),
      });
      if (!res.ok || !res.body) {
        yield { delta: '', error: `元宝网关 HTTP ${res.status}` };
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
            const delta: string = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
            if (delta) yield { delta };
          } catch {
            /* ignore */
          }
        }
      }
      yield { delta: '', done: true };
    } catch (e) {
      yield { delta: '', error: `元宝网关请求失败：${(e as Error).message}` };
    }
  }

  async test(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.cfg.models[0]?.id, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false }),
      });
      return res.status < 500;
    } catch {
      return false;
    }
  }

  async list(): Promise<ModelEntry[]> {
    // 真实环境模型清单由服务端下发，此处返回预置项（运行时可与服务端合并，见 providerManager）
    return this.cfg.models ?? [];
  }
}
