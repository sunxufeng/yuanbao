/**
 * 预置 Provider 清单
 *
 * 本增强版默认不内置任何第三方 Provider。用户需在选项页添加自己的 Provider（OpenAI 兼容端点、
 * Anthropic 端点或任意自定义端点），API Key 仅保存在 chrome.storage.local。
 *
 * 若后续需要恢复预设模板，可在此数组补充并调整 storage.ts 的合并逻辑。
 */
import type { ProviderConfig } from '@/types/model';

/** 元宝默认网关（若用户自行添加元宝 Provider 可覆盖 baseURL） */
export const DEFAULT_YUANBAO_BASEURL = 'https://yuanbao.tencent.com';

/** 自定义 Provider 默认占位 Base URL */
export const DEFAULT_CUSTOM_BASEURL = 'https://api.openai.com/v1';

export const BUILTIN_PROVIDERS: ProviderConfig[] = [];

export const DEFAULT_MODEL_ID = '';
