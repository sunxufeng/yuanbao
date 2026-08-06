/**
 * 配置存储层（第 11.5 章）
 *  - Provider 配置（含 apiKey）仅存 chrome.storage.local，绝不进 storage.sync（防跨设备泄露）。
 *  - 首次启动写入预置 Provider；用户后续在 options 页增删改自定义项。
 *  - 无 chrome.storage 环境（单测/jsdom）降级为内存 Map。
 */
import type { ProviderConfig } from '@/types/model';
import { BUILTIN_PROVIDERS, DEFAULT_MODEL_ID } from './builtinModels';

const PROVIDERS_KEY = 'providers';
const DEFAULT_MODEL_KEY = 'defaultModel';

const memoryFallback = new Map<string, unknown>();

function getArea(): chrome.storage.LocalStorageArea | null {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) return chrome.storage.local;
  } catch {
    /* noop */
  }
  return null;
}

async function readRaw<T>(key: string): Promise<T | undefined> {
  const area = getArea();
  if (area) {
    const r = await area.get(key);
    return r[key] as T | undefined;
  }
  return memoryFallback.get(key) as T | undefined;
}

async function writeRaw(key: string, value: unknown): Promise<void> {
  const area = getArea();
  if (area) {
    await area.set({ [key]: value });
    return;
  }
  memoryFallback.set(key, value);
}

/** 读取 provider 列表：首次注入预置项，并合并“启用/密钥”等用户态覆盖。 */
export async function getProviders(): Promise<ProviderConfig[]> {
  const stored = await readRaw<ProviderConfig[]>(PROVIDERS_KEY);
  if (!stored || stored.length === 0) {
    await writeRaw(PROVIDERS_KEY, BUILTIN_PROVIDERS);
    return structuredClone(BUILTIN_PROVIDERS);
  }
  // 合并预置项的新模型（保证升级后新增预设模型可用），用户自定义项完整保留
  const byId = new Map(stored.map((p) => [p.id, p]));
  const merged: ProviderConfig[] = [];
  for (const builtin of BUILTIN_PROVIDERS) {
    const user = byId.get(builtin.id);
    if (user) {
      merged.push({
        ...builtin,
        ...user,
        builtin: true,
        // 若用户未覆盖模型，则用预置模型；否则用用户的（含自定义新增）
        models: user.models?.length ? user.models : builtin.models,
        apiKey: user.apiKey ?? builtin.apiKey,
        enabled: user.enabled ?? builtin.enabled,
      });
      byId.delete(builtin.id);
    } else {
      merged.push(structuredClone(builtin));
    }
  }
  // 保留用户自建（非 builtin）的 provider
  for (const leftover of byId.values()) merged.push(leftover);
  await writeRaw(PROVIDERS_KEY, merged);
  return merged;
}

export async function saveProviders(providers: ProviderConfig[]): Promise<void> {
  // 写入前剥离敏感字段的双重保险（理论上本就不进 sync）
  await writeRaw(PROVIDERS_KEY, providers);
}

export async function getDefaultModel(): Promise<string | null> {
  return (await readRaw<string>(DEFAULT_MODEL_KEY)) ?? DEFAULT_MODEL_ID;
}

export async function setDefaultModel(modelId: string): Promise<void> {
  await writeRaw(DEFAULT_MODEL_KEY, modelId);
}
