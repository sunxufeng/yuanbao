/**
 * 预置 Provider 清单（第 11.2 / 11.3 章）
 *
 * 三类 Provider：
 *  1. yuanbao（内置）：保留元宝网关，模型清单沿用服务端下发（此处预置已知项，运行时会与服务端合并）。
 *  2. openai-compatible（常用大模型）：统一走 OpenAI Chat Completions 协议；
 *     其中 Claude 用 Anthropic 原生协议（extInfo.dialect='anthropic'），由 provider 内部兼容。
 *  3. custom（用户自定义）：运行时由 options 页动态生成，不在此预置。
 *
 * 注意：apiKey 一律留空，由用户在 options 页填写，仅存 storage.local。
 */
import type { ProviderConfig } from '@/types/model';

/** 元宝默认网关（若用户自有网关可覆盖 baseURL） */
export const DEFAULT_YUANBAO_BASEURL = 'https://yuanbao.tencent.com';

export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  // 1) 内置 yuanbao
  {
    id: 'yuanbao',
    type: 'yuanbao',
    name: '元宝（腾讯混元）',
    baseURL: DEFAULT_YUANBAO_BASEURL,
    enabled: true,
    builtin: true,
    models: [
      {
        id: 'yuanbao-hunyuan',
        label: '混元 Hunyuan',
        providerId: 'yuanbao',
        capability: ['chat', 'vision', 'translate'],
      },
      {
        id: 'yuanbao-hunyuan-t1',
        label: '混元深度思考 (T1)',
        providerId: 'yuanbao',
        capability: ['chat'],
        extInfo: { think: true },
      },
      {
        id: 'yuanbao-deepseek-r1',
        label: 'DeepSeek R1（联网识图满血版）',
        providerId: 'yuanbao',
        capability: ['chat', 'vision'],
      },
    ],
  },

  // 2) 常用大模型（OpenAI 兼容 / Anthropic 兼容）
  {
    id: 'openai',
    type: 'openai-compatible',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    enabled: true,
    builtin: true,
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', providerId: 'openai', capability: ['chat', 'vision'] },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', providerId: 'openai', capability: ['chat', 'vision'] },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', providerId: 'openai', capability: ['chat', 'vision'] },
    ],
  },
  {
    id: 'deepseek',
    type: 'openai-compatible',
    name: 'DeepSeek 官方',
    baseURL: 'https://api.deepseek.com/v1',
    enabled: true,
    builtin: true,
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek V3 (chat)', providerId: 'deepseek', capability: ['chat'] },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1 (reasoner)', providerId: 'deepseek', capability: ['chat'], extInfo: { think: true } },
    ],
  },
  {
    id: 'qwen',
    type: 'openai-compatible',
    name: '通义千问 Qwen',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    enabled: true,
    builtin: true,
    models: [
      { id: 'qwen-max', label: 'Qwen-Max', providerId: 'qwen', capability: ['chat', 'vision'] },
      { id: 'qwen-plus', label: 'Qwen-Plus', providerId: 'qwen', capability: ['chat'] },
    ],
  },
  {
    id: 'glm',
    type: 'openai-compatible',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    enabled: true,
    builtin: true,
    models: [
      { id: 'glm-4-plus', label: 'GLM-4-Plus', providerId: 'glm', capability: ['chat', 'vision'] },
      { id: 'glm-4-air', label: 'GLM-4-Air', providerId: 'glm', capability: ['chat'] },
    ],
  },
  {
    id: 'kimi',
    type: 'openai-compatible',
    name: 'Kimi / Moonshot',
    baseURL: 'https://api.moonshot.cn/v1',
    enabled: true,
    builtin: true,
    models: [
      { id: 'moonshot-v1-8k', label: 'Kimi (Moonshot v1-8k)', providerId: 'kimi', capability: ['chat'] },
    ],
  },
  {
    id: 'gemini',
    type: 'openai-compatible',
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    enabled: true,
    builtin: true,
    models: [
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', providerId: 'gemini', capability: ['chat', 'vision'] },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', providerId: 'gemini', capability: ['chat', 'vision'] },
    ],
  },
  {
    id: 'claude',
    type: 'openai-compatible',
    name: 'Claude（Anthropic）',
    baseURL: 'https://api.anthropic.com/v1',
    enabled: true,
    builtin: true,
    models: [
      { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', providerId: 'claude', capability: ['chat', 'vision'], extInfo: { dialect: 'anthropic' } },
      { id: 'claude-3-haiku', label: 'Claude 3 Haiku', providerId: 'claude', capability: ['chat'], extInfo: { dialect: 'anthropic' } },
    ],
  },
  {
    id: 'ollama',
    type: 'openai-compatible',
    name: '本地 Ollama',
    baseURL: 'http://127.0.0.1:11434/v1',
    enabled: false,
    builtin: true,
    models: [
      { id: 'ollama-llama3', label: 'Ollama llama3', providerId: 'ollama', capability: ['chat'] },
    ],
  },
];

export const DEFAULT_MODEL_ID = 'yuanbao-hunyuan';
