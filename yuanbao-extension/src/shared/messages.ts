/**
 * UI（popup / sidepanel / options）与后台 Service Worker 之间的消息协议。
 * 统一用 chrome.runtime.sendMessage / connect，类型化减少出错。
 */

import type { ChatRequest, ProviderConfig, ModelEntry, TransformRequest } from '@/types/model';

/** 客户端 → 后台 的消息 */
export type ToBackground =
  | { action: 'getProviders' }
  | { action: 'saveProviders'; providers: ProviderConfig[] }
  | { action: 'getModels' }
  | { action: 'testProvider'; providerId: string }
  | { action: 'chat'; req: ChatRequest } // 走 Port 长连接
  | { action: 'transform'; req: TransformRequest } // 走 Port 长连接
  | { action: 'getDefaultModel' }
  | { action: 'setDefaultModel'; modelId: string }
  | { action: 'askYuanbao'; text: string }
  | { action: 'captureAndAsk'; text?: string }
  | { action: 'getPageContent' };

/** 后台 → 客户端 的响应 */
export type FromBackground =
  | { ok: true; providers: ProviderConfig[] }
  | { ok: true; models: ModelEntry[] }
  | { ok: true; tested: boolean }
  | { ok: true; defaultModel: string | null }
  | { ok: false; error: string };

/** Port 流式消息（chat / transform 用） */
export type StreamMessage =
  | { type: 'chunk'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const PORT_NAME = 'yuanbao-stream';
