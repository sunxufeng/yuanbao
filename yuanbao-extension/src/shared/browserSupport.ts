/**
 * 浏览器能力探测（T10 多浏览器兼容 + T1 防御性报错修复）
 *  - Firefox 不支持 chrome.sidePanel，需回退到 popup（manifest 已配置 default_popup）。
 *  - 用能力探测代替 UA 判断，更稳；所有 chrome API 调用统一走 safeChrome 吞掉
 *    Unchecked runtime.lastError 类报错，避免“报错但不影响使用”的噪声。
 */
export function isFirefox(): boolean {
  try {
    // Firefox 暴露全局 browser.* 且支持 getBrowserInfo
    // @ts-ignore
    return typeof browser !== 'undefined' && typeof browser.runtime?.getBrowserInfo === 'function';
  } catch {
    return false;
  }
}

export function hasSidePanel(): boolean {
  return typeof chrome !== 'undefined' && !!(chrome as unknown as { sidePanel?: unknown }).sidePanel;
}

/**
 * 安全执行 chrome API：吞掉同步异常与 runtime.lastError，返回 fallback。
 * 这是 T1 的核心修复手段——把“报错但不影响使用”的噪声降到 0。
 */
export function safeChrome<T>(fn: () => T, fallback: T): T {
  try {
    const r = fn();
    const lastErr = chrome.runtime?.lastError;
    if (lastErr) {
      console.warn('[yuanbao] chrome api lastError:', lastErr.message);
    }
    return r;
  } catch (e) {
    console.warn('[yuanbao] chrome api error:', (e as Error).message);
    return fallback;
  }
}
