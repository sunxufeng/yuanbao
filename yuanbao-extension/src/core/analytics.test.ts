import { describe, it, expect, beforeEach } from 'vitest';
import { track, getAnalytics, clearAnalytics } from './analytics';

/** 进程内内存版 chrome.storage.local 替身 */
function installStorage() {
  const store: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: async (k: string | string[]) => {
          if (Array.isArray(k)) {
            const out: Record<string, unknown> = {};
            for (const key of k) out[key] = store[key];
            return out;
          }
          return { [k]: store[k] };
        },
        set: async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        },
        remove: async (k: string | string[]) => {
          for (const key of Array.isArray(k) ? k : [k]) delete store[key];
        },
      },
    },
  };
  return store;
}

describe('analytics 本地埋点', () => {
  beforeEach(() => {
    installStorage();
  });

  it('track 累加同一事件计数', async () => {
    await track('model_used');
    await track('model_used');
    await track('model_fallback');
    const c = await getAnalytics();
    expect(c.model_used).toBe(2);
    expect(c.model_fallback).toBe(1);
  });

  it('clearAnalytics 清空计数', async () => {
    await track('x');
    await clearAnalytics();
    const c = await getAnalytics();
    expect(Object.keys(c).length).toBe(0);
  });

  it('无 chrome 环境时不抛错', async () => {
    delete (globalThis as any).chrome;
    await expect(track('y')).resolves.toBeUndefined();
    await expect(getAnalytics()).resolves.toEqual({});
  });
});
