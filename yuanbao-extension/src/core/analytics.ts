/**
 * 本地埋点（PRD §7）。
 *  - 仅在本机 chrome.storage.local 保存“聚合计数”，不上报网络、不上报页面正文、不上报 apiKey。
 *  - 事件：model_used / model_fallback / transform_degraded / custom_provider_saved / runtime_error。
 *  - 所有调用均吞掉异常，确保埋点失败不影响主流程。
 */

const KEY = 'yb_analytics';
export type Counters = Record<string, number>;

export async function track(event: string): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const r = await chrome.storage.local.get(KEY);
    const c: Counters = (r[KEY] as Counters) ?? {};
    c[event] = (c[event] ?? 0) + 1;
    await chrome.storage.local.set({ [KEY]: c });
  } catch {
    /* 埋点失败不影响主流程 */
  }
}

export async function getAnalytics(): Promise<Counters> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
    const r = await chrome.storage.local.get(KEY);
    return (r[KEY] as Counters) ?? {};
  } catch {
    return {};
  }
}

export async function clearAnalytics(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.remove(KEY);
  } catch {
    /* ignore */
  }
}
