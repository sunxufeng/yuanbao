/**
 * 模型层核心类型定义（第 11 章 Model Provider 抽象层）
 *
 * 设计要点：
 *  - ModelProvider 是“一个后端/一个端点”的抽象；ModelEntry 是“一个具体模型”。
 *  - 对话/翻译/总结统一通过 ModelEntry.providerId 路由到对应 Provider。
 *  - apiKey 仅存在于 ProviderConfig（运行时注入 Provider），永不进入 storage.sync。
 */

export type ProviderType = 'yuanbao' | 'openai-compatible' | 'custom';

export type Capability = 'chat' | 'vision' | 'translate';

/** 单一模型描述 */
export interface ModelEntry {
  /** 全局唯一模型 id，如 'yuanbao-hunyuan'、'gpt-4o'、'custom-ollama-llama3' */
  id: string;
  /** 展示名 */
  label: string;
  /** 所属 Provider id */
  providerId: string;
  /** 能力标签：决定翻译/总结降级与视觉问答路由 */
  capability: Capability[];
  /** 厂商特定扩展信息（如 yuanbao 的 chatModelExtInfo / 思考模式开关） */
  extInfo?: Record<string, unknown>;
}

/** Provider 配置（用户可编辑；内置项带 builtin=true 不可删除） */
export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  /** 兼容/自定义端点 baseURL；yuanbao 内置可为空（走默认网关） */
  baseURL?: string;
  /** 仅存于 chrome.storage.local，不进 sync */
  apiKey?: string;
  models: ModelEntry[];
  enabled: boolean;
  /** 预置 Provider，不可删除（但可关闭） */
  builtin?: boolean;
}

export type Role = 'system' | 'user' | 'assistant';

export interface TextPart {
  type: 'text';
  text: string;
}
export interface ImagePart {
  type: 'image_url';
  image_url: { url: string };
}
export type ContentPart = TextPart | ImagePart;

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[];
}

export interface ChatRequest {
  /** ModelEntry.id */
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** 页面上下文（可选，用于“问当前页”场景） */
  pageContext?: string;
}

/** 流式输出的最小单元 */
export interface ChatChunk {
  /** 增量文本 */
  delta: string;
  /** 流结束标记 */
  done?: boolean;
  /** 错误信息（若有） */
  error?: string;
}

/** Provider 运行时接口（与配置解耦） */
export interface ModelProvider {
  id: string;
  type: ProviderType;
  name: string;
  /** 返回该 provider 下的模型清单 */
  list(): Promise<ModelEntry[]>;
  /** 流式对话 */
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  /** 连通性自检（用于 options 页“测试连接”） */
  test(): Promise<boolean>;
}

/** 翻译/总结降级请求（非元宝模型时走 chat + 专用 prompt） */
export interface TransformRequest {
  text: string;
  targetLang?: string;
  /** 'translate' | 'summarize' */
  task: 'translate' | 'summarize';
  model: string;
}
