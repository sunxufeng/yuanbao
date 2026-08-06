/**
 * 自定义 Provider（第 11.3 章）
 * 用户通过 options 页填写 baseURL + API Key + modelId，本质是“可配置的 OpenAI 兼容端点”。
 * 复用 OpenAICompatibleProvider 的全部能力（含 Anthropic 方言），仅类型标记为 'custom'。
 */
import { OpenAICompatibleProvider } from './openai';

export class CustomProvider extends OpenAICompatibleProvider {}
